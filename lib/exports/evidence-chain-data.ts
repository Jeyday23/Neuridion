import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type {
  CapabilityStatus,
  EvidenceChainData,
  ExportRow,
} from './evidence-chain'

export const EVIDENCE_EXPORT_PAGE_SIZE = 500
export const EVIDENCE_EXPORT_MAX_ROWS_PER_TABLE = 100_000
export const EVIDENCE_EXPORT_MAX_TOTAL_ROWS = 250_000
export const EVIDENCE_EXPORT_MAX_QUERIES = 2_000
const IN_FILTER_CHUNK = 150

type QueryError = { code?: string; message?: string; details?: string } | null
type QueryResult = { data: unknown[] | null; error: QueryError }

interface DynamicQuery {
  eq(column: string, value: unknown): DynamicQuery
  in(column: string, values: string[]): DynamicQuery
  contains(column: string, value: unknown): DynamicQuery
  order(column: string, options?: { ascending?: boolean }): DynamicQuery
  range(from: number, to: number): Promise<QueryResult>
}

interface DynamicDb {
  from(table: string): {
    select(columns: string): DynamicQuery
  }
}

type Filter =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'in'; column: string; values: string[] }
  | { kind: 'contains'; column: string; value: unknown }

interface ReadSpec {
  table: string
  columns?: string
  filters?: Filter[]
  order?: Array<{ column: string; ascending?: boolean }>
}

interface OptionalRead {
  available: boolean
  table: string
  rows: ExportRow[]
  missingReason: 'relation' | 'column' | null
}

interface ReadBudget {
  queries: number
  rows: number
}

const STABLE_TABLE_ORDER: Record<string, string[]> = {
  fetch_artifacts: ['fetch_id', 'evidence_id', 'artifact_role'],
  authority_record_supersessions: ['predecessor_id', 'successor_id'],
}

function dynamicDb(db: SupabaseClient<Database>): DynamicDb {
  return db as unknown as DynamicDb
}

function applyQuery(db: SupabaseClient<Database>, spec: ReadSpec): DynamicQuery {
  let query = dynamicDb(db).from(spec.table).select(spec.columns ?? '*')
  for (const filter of spec.filters ?? []) {
    if (filter.kind === 'eq') query = query.eq(filter.column, filter.value)
    if (filter.kind === 'in') query = query.in(filter.column, filter.values)
    if (filter.kind === 'contains') query = query.contains(filter.column, filter.value)
  }
  const orderColumns: Array<{ column: string; ascending?: boolean }> = spec.order
    ?? (STABLE_TABLE_ORDER[spec.table] ?? ['id']).map((column) => ({ column }))
  for (const order of orderColumns) {
    query = query.order(order.column, { ascending: order.ascending ?? true })
  }
  return query
}

function missingSchemaReason(error: QueryError): 'relation' | 'column' | null {
  const code = error?.code ?? ''
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  if (
    code === '42P01'
    || code === 'PGRST205'
    || (message.includes('relation') && message.includes('does not exist'))
    || message.includes('could not find the table')
  ) return 'relation'
  if (
    code === '42703'
    || code === 'PGRST204'
    || (message.includes('column') && message.includes('does not exist'))
    || message.includes('could not find the') && message.includes('column')
  ) return 'column'
  return null
}

export function isOptionalSchemaAbsence(error: QueryError): boolean {
  return missingSchemaReason(error) !== null
}

async function readRows(
  db: SupabaseClient<Database>,
  spec: ReadSpec,
  budget: ReadBudget,
  optional = false,
): Promise<OptionalRead> {
  const rows: ExportRow[] = []
  for (let from = 0; from < EVIDENCE_EXPORT_MAX_ROWS_PER_TABLE; from += EVIDENCE_EXPORT_PAGE_SIZE) {
    budget.queries += 1
    if (budget.queries > EVIDENCE_EXPORT_MAX_QUERIES) {
      throw new Error('Evidence export query safety limit exceeded')
    }
    const { data, error } = await applyQuery(db, spec)
      .range(from, from + EVIDENCE_EXPORT_PAGE_SIZE - 1)
    if (error) {
      const missingReason = missingSchemaReason(error)
      if (optional && missingReason) {
        return { available: false, table: spec.table, rows: [], missingReason }
      }
      throw new Error(`Evidence export query failed for ${spec.table} (${error.code ?? 'unknown'})`)
    }

    const page = (data ?? []) as ExportRow[]
    rows.push(...page)
    budget.rows += page.length
    if (budget.rows > EVIDENCE_EXPORT_MAX_TOTAL_ROWS) {
      throw new Error('Evidence export total row safety limit exceeded')
    }
    if (page.length < EVIDENCE_EXPORT_PAGE_SIZE) {
      return { available: true, table: spec.table, rows, missingReason: null }
    }
  }

  throw new Error(`Evidence export row safety limit exceeded for ${spec.table}`)
}

async function readByIds(
  db: SupabaseClient<Database>,
  table: string,
  column: string,
  ids: string[],
  budget: ReadBudget,
  optional = false,
): Promise<OptionalRead> {
  const uniqueIds = [...new Set(ids)].sort()
  if (uniqueIds.length === 0) {
    // Probe optional tables so the manifest distinguishes an available empty
    // capability from a migration that has not been deployed.
    if (optional) {
      return readRows(db, {
        table,
        filters: [{
          kind: 'in',
          column,
          values: ['00000000-0000-4000-8000-000000000000'],
        }],
      }, budget, true)
    }
    return { available: true, table, rows: [], missingReason: null }
  }

  const rows: ExportRow[] = []
  for (let i = 0; i < uniqueIds.length; i += IN_FILTER_CHUNK) {
    const read = await readRows(db, {
      table,
      filters: [{ kind: 'in', column, values: uniqueIds.slice(i, i + IN_FILTER_CHUNK) }],
    }, budget, optional)
    if (!read.available) return read
    rows.push(...read.rows)
  }
  return { available: true, table, rows, missingReason: null }
}

function strings(rows: ExportRow[], key: string): string[] {
  return rows
    .map((row) => row[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function uniqueRows(rows: ExportRow[]): ExportRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const identity = typeof row.id === 'string'
      ? `id:${row.id}`
      : JSON.stringify(row)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function capability(read: OptionalRead): CapabilityStatus {
  return read.available
    ? { status: 'available', source_table: read.table, row_count: read.rows.length, reason: null }
    : { status: 'unavailable', source_table: null, row_count: 0, reason: 'schema_capability_not_available' }
}

async function optionalRunCapability(
  db: SupabaseClient<Database>,
  table: string,
  runId: string,
  budget: ReadBudget,
): Promise<OptionalRead> {
  return readRows(db, {
    table,
    filters: [{ kind: 'eq', column: 'search_run_id', value: runId }],
  }, budget, true)
}

/**
 * Loads the complete run-linked evidence graph after the route has verified
 * ownership. New validation tables are capability-probed so a staggered
 * migration produces an explicit unavailable section rather than a 500 or a
 * silently omitted field.
 */
export async function loadEvidenceChainData(
  db: SupabaseClient<Database>,
  run: ExportRow,
  userId: string,
): Promise<EvidenceChainData> {
  const runId = String(run.id)
  const profileId = String(run.profile_id)
  if (!runId || runId === 'undefined' || !profileId || profileId === 'undefined') {
    throw new TypeError('Evidence export requires a run and profile ID')
  }
  if (run.user_id !== userId) throw new TypeError('Evidence export ownership check failed')
  if (run.is_synthetic_canary === true) throw new TypeError('Synthetic canary export is prohibited')

  const budget: ReadBudget = { queries: 0, rows: 0 }
  const availability: Record<string, CapabilityStatus> = {}
  const warnings: string[] = []

  const [
    profileRead,
    profileHistoryRead,
    resultsRead,
    auditRead,
    reportsRead,
    reviewerAssignmentsRead,
    reviewRequirementsRead,
    adjudicationsRead,
    samplingRead,
  ] = await Promise.all([
    readRows(db, {
      table: 'product_profiles',
      filters: [
        { kind: 'eq', column: 'id', value: profileId },
        { kind: 'eq', column: 'user_id', value: userId },
      ],
    }, budget),
    readRows(db, {
      table: 'profile_edit_history',
      filters: [{ kind: 'eq', column: 'profile_id', value: profileId }],
    }, budget, true),
    readRows(db, {
      table: 'fsn_results',
      filters: [{ kind: 'eq', column: 'run_id', value: runId }],
    }, budget),
    readRows(db, {
      table: 'audit_log',
      columns: 'id,user_id,event_type,event_data,created_at',
      filters: [
        { kind: 'eq', column: 'user_id', value: userId },
        { kind: 'contains', column: 'event_data', value: { run_id: runId } },
      ],
    }, budget),
    readRows(db, {
      table: 'reports',
      filters: [
        { kind: 'eq', column: 'run_id', value: runId },
        { kind: 'eq', column: 'user_id', value: userId },
      ],
    }, budget, true),
    optionalRunCapability(db, 'run_reviewer_assignments', runId, budget),
    optionalRunCapability(db, 'review_requirements', runId, budget),
    optionalRunCapability(db, 'human_adjudication_events', runId, budget),
    optionalRunCapability(db, 'exclusion_review_samples', runId, budget),
  ])

  if (profileRead.rows.length !== 1) {
    throw new Error('Evidence export profile ownership invariant failed')
  }

  availability.profile_edit_history = capability(profileHistoryRead)
  availability.reports = capability(reportsRead)
  availability.reviewer_assignments = capability(reviewerAssignmentsRead)
  availability.review_requirements = capability(reviewRequirementsRead)
  availability.human_adjudications = capability(adjudicationsRead)
  availability.sampling_metadata = capability(samplingRead)

  const results = resultsRead.rows
  const [decisionsByRun, decisionsByResult] = await Promise.all([
    readRows(db, {
      table: 'filter_decisions',
      filters: [{ kind: 'eq', column: 'search_run_id', value: runId }],
    }, budget),
    readByIds(db, 'filter_decisions', 'fsn_result_id', strings(results, 'id'), budget),
  ])
  const decisions = uniqueRows([...decisionsByRun.rows, ...decisionsByResult.rows])
  const canonicalIds = strings(results, 'canonical_id')
  const linkedRevisionIds = [
    ...strings(results, 'authority_revision_id'),
    ...strings(decisions, 'authority_revision_id'),
  ]

  const [canonicalRead, revisionsById, revisionsByAuthority] = await Promise.all([
    readByIds(db, 'fsn_canonical', 'id', canonicalIds, budget, true),
    readByIds(db, 'authority_record_revisions', 'id', linkedRevisionIds, budget, true),
    readByIds(db, 'authority_record_revisions', 'authority_record_id', canonicalIds, budget, true),
  ])
  const revisions = uniqueRows([...revisionsById.rows, ...revisionsByAuthority.rows])
  const observationIds = strings(revisions, 'observation_id')

  const [observationsById, observationsByAuthority] = await Promise.all([
    readByIds(db, 'fsn_observations', 'id', observationIds, budget, true),
    readByIds(db, 'fsn_observations', 'authority_record_id', canonicalIds, budget, true),
  ])
  const observations = uniqueRows([...observationsById.rows, ...observationsByAuthority.rows])
  const fetchIds = strings(observations, 'fetch_id')

  const [fetchesRead, artifactsRead] = await Promise.all([
    readByIds(db, 'source_fetches', 'id', fetchIds, budget, true),
    readByIds(db, 'fetch_artifacts', 'fetch_id', fetchIds, budget, true),
  ])
  const evidenceIds = [
    ...strings(observations, 'evidence_id'),
    ...strings(artifactsRead.rows, 'evidence_id'),
  ]

  const [evidenceRead, governanceRead, extractionAttemptsRead, extractionsRead] = await Promise.all([
    readByIds(db, 'evidence_objects', 'id', evidenceIds, budget, true),
    readByIds(db, 'evidence_governance_events', 'evidence_id', evidenceIds, budget, true),
    readByIds(db, 'document_extraction_attempts', 'evidence_id', evidenceIds, budget, true),
    readByIds(db, 'document_extractions', 'evidence_id', evidenceIds, budget, true),
  ])
  const extractionIds = strings(extractionsRead.rows, 'id')

  const [detailsRead, identityRead, assertionsRead, supersessionPredecessors, supersessionSuccessors] = await Promise.all([
    readByIds(db, 'fsn_detail', 'extraction_id', extractionIds, budget, true),
    readByIds(db, 'fsn_identity_observations', 'extraction_id', extractionIds, budget, true),
    readByIds(db, 'safety_action_match_assertions', 'observation_id', strings(observations, 'id'), budget, true),
    readByIds(db, 'authority_record_supersessions', 'predecessor_id', canonicalIds, budget, true),
    readByIds(db, 'authority_record_supersessions', 'successor_id', canonicalIds, budget, true),
  ])
  const actionsRead = await readByIds(
    db,
    'regulatory_safety_actions',
    'id',
    strings(assertionsRead.rows, 'safety_action_id'),
    budget,
    true,
  )

  const evidenceCapabilities: Array<[string, OptionalRead]> = [
    ['canonical_records', canonicalRead],
    ['authority_record_revisions', revisionsByAuthority.available ? revisionsByAuthority : revisionsById],
    ['observations', observationsByAuthority.available ? observationsByAuthority : observationsById],
    ['source_fetches', fetchesRead],
    ['fetch_artifacts', artifactsRead],
    ['evidence_objects', evidenceRead],
    ['evidence_governance_events', governanceRead],
    ['document_extraction_attempts', extractionAttemptsRead],
    ['document_extractions', extractionsRead],
    ['fsn_detail', detailsRead],
    ['identity_observations', identityRead],
    ['safety_action_match_assertions', assertionsRead],
    ['regulatory_safety_actions', actionsRead],
    ['authority_record_supersessions', supersessionPredecessors.available ? supersessionPredecessors : supersessionSuccessors],
  ]
  for (const [name, read] of evidenceCapabilities) availability[name] = capability(read)
  const snapshot = run.profile_snapshot && typeof run.profile_snapshot === 'object'
    && !Array.isArray(run.profile_snapshot)
    ? run.profile_snapshot as ExportRow
    : null
  const snapshotControlledEvidence = Array.isArray(snapshot?.controlled_evidence)
    ? snapshot.controlled_evidence.length
    : 0
  availability.controlled_evidence_snapshot = snapshot && 'controlled_evidence_status' in snapshot
    ? {
        status: 'available',
        source_table: 'search_runs.profile_snapshot',
        row_count: snapshotControlledEvidence,
        reason: null,
      }
    : {
        status: 'unavailable',
        source_table: null,
        row_count: 0,
        reason: 'historical_data_not_recorded',
      }

  for (const [name, status] of Object.entries(availability)) {
    if (status.status === 'unavailable') warnings.push(`${name}: schema capability not available at export time`)
  }
  if (decisions.some((row) => !row.prompt_version)) {
    warnings.push('One or more legacy AI decisions have no recorded prompt version.')
  }
  if (run.profile_snapshot == null) {
    warnings.push('This run has no frozen profile snapshot; current profile data is included separately.')
  }

  return {
    run,
    profile: profileRead.rows[0] ?? null,
    profileHistory: profileHistoryRead.rows,
    results,
    decisions,
    canonicalRecords: canonicalRead.rows,
    sourceFetches: fetchesRead.rows,
    evidenceObjects: evidenceRead.rows,
    fetchArtifacts: artifactsRead.rows,
    observations,
    revisions,
    governanceEvents: governanceRead.rows,
    extractionAttempts: extractionAttemptsRead.rows,
    extractions: extractionsRead.rows,
    fsnDetails: detailsRead.rows,
    identityObservations: identityRead.rows,
    safetyActions: actionsRead.rows,
    safetyActionAssertions: assertionsRead.rows,
    supersessions: uniqueRows([...supersessionPredecessors.rows, ...supersessionSuccessors.rows]),
    reviewerAssignments: reviewerAssignmentsRead.rows,
    reviewRequirements: reviewRequirementsRead.rows,
    adjudications: adjudicationsRead.rows,
    samplingRecords: samplingRead.rows,
    auditEvents: auditRead.rows,
    reports: reportsRead.rows,
    availability,
    warnings,
  }
}
