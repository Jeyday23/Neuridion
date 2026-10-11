import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { AdjudicationEvent } from '@/lib/adjudication/types'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { effectiveDecisionsByResult } from './effective'
import type { CycleRecordInput, CycleRunSummary, CycleSide, SourceBreakdownInput } from './compare'

/**
 * Read-only loaders for previous-cycle comparison. Every caller passes the
 * service-role client and the authenticated owner id; ownership, soft delete
 * and synthetic-canary exclusion are enforced in each query, not by RLS.
 */

type Db = SupabaseClient<Database>

export const COMPARABLE_RUN_STATUSES = ['complete', 'degraded'] as const

export const RUN_COLUMNS =
  'id, user_id, profile_id, status, review_status, created_at, period_from, period_to, search_period_from, search_period_to, dbs_searched, timing, profile_snapshot, terms_used'

export interface CycleRunRow {
  id: string
  user_id: string
  profile_id: string
  status: string
  review_status: string | null
  created_at: string
  period_from: string | null
  period_to: string | null
  search_period_from: string | null
  search_period_to: string | null
  dbs_searched: unknown
  timing: unknown
  profile_snapshot: unknown
  terms_used: unknown
}

export class CycleLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CycleLoadError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function sourceBreakdown(timing: unknown): SourceBreakdownInput[] {
  const raw = asRecord(timing)?.source_breakdown
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const entry = asRecord(item)
    if (!entry || typeof entry.source !== 'string' || typeof entry.status !== 'string') return []
    return [{
      source: entry.source,
      status: entry.status,
      requested_from: typeof entry.requested_from === 'string' ? entry.requested_from : null,
      requested_to: typeof entry.requested_to === 'string' ? entry.requested_to : null,
    }]
  })
}

export function toRunSummary(row: CycleRunRow): CycleRunSummary {
  return {
    id: row.id,
    status: row.status,
    review_status: row.review_status,
    created_at: row.created_at,
    period_from: row.period_from ?? row.search_period_from,
    period_to: row.period_to ?? row.search_period_to,
    dbs_searched: asStringArray(row.dbs_searched),
    source_breakdown: sourceBreakdown(row.timing),
    profile_snapshot: asRecord(row.profile_snapshot),
    terms_used: asRecord(row.terms_used),
  }
}

/** Loads one run owned by `userId`, excluding deleted and canary runs. */
export async function loadOwnedRun(db: Db, runId: string, userId: string): Promise<CycleRunRow | null> {
  const { data, error } = await db
    .from('search_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new CycleLoadError(`run lookup failed (${error.code ?? 'unknown'})`)
  if (!data) return null
  const row = data as CycleRunRow
  // Defence in depth: never trust the filter alone for ownership.
  return row.user_id === userId ? row : null
}

/**
 * Latest earlier run for the same profile and owner with status complete or
 * degraded, not deleted, not a canary, created strictly before `run`. With
 * `preferApproved`, the latest approved such run wins when one exists.
 */
export async function findPreviousRun(
  db: Db,
  run: Pick<CycleRunRow, 'id' | 'user_id' | 'profile_id' | 'created_at'>,
  options: { preferApproved?: boolean } = {},
): Promise<CycleRunRow | null> {
  const query = (approvedOnly: boolean) => {
    let q = db
      .from('search_runs')
      .select(RUN_COLUMNS)
      .eq('user_id', run.user_id)
      .eq('profile_id', run.profile_id)
      .eq('is_synthetic_canary', false)
      .is('deleted_at', null)
      .in('status', [...COMPARABLE_RUN_STATUSES])
      .lt('created_at', run.created_at)
      .neq('id', run.id)
    if (approvedOnly) q = q.eq('review_status', 'approved')
    return q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
  }

  if (options.preferApproved) {
    const { data, error } = await query(true)
    if (error) throw new CycleLoadError(`previous approved run lookup failed (${error.code ?? 'unknown'})`)
    const row = (data?.[0] ?? null) as CycleRunRow | null
    if (row) return row
  }
  const { data, error } = await query(false)
  if (error) throw new CycleLoadError(`previous run lookup failed (${error.code ?? 'unknown'})`)
  return (data?.[0] ?? null) as CycleRunRow | null
}

/** Loads every screened record of a run with its effective decision. */
export async function loadRunRecords(db: Db, runId: string): Promise<CycleRecordInput[]> {
  const [results, decisions, events] = await Promise.all([
    fetchAllRows((from, to) => db.from('fsn_results')
      .select('id, source_db, external_id, title, fsn_date, source_url, content_hash, attachment_digest')
      .eq('run_id', runId)
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows((from, to) => db.from('filter_decisions')
      .select('id, fsn_result_id, decision, decided_at')
      .eq('search_run_id', runId)
      .order('decided_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows((from, to) => db.from('human_adjudication_events')
      .select('*')
      .eq('search_run_id', runId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)),
  ])
  const error = results.error ?? decisions.error ?? events.error
  if (error) throw new CycleLoadError(`run evidence unavailable (${error.code ?? 'unknown'})`)

  const effective = effectiveDecisionsByResult(
    results.data.map((row) => row.id),
    decisions.data,
    events.data as AdjudicationEvent[],
  )
  return results.data.map((row) => ({
    result_id: row.id,
    source_db: row.source_db,
    external_id: row.external_id,
    title: row.title,
    fsn_date: row.fsn_date,
    source_url: row.source_url,
    content_hash: row.content_hash,
    attachment_digest: row.attachment_digest,
    decision: effective.get(row.id) ?? { decision: null, origin: 'none', human_state: null },
  }))
}

export async function loadCycleSide(db: Db, row: CycleRunRow): Promise<CycleSide> {
  return { run: toRunSummary(row), records: await loadRunRecords(db, row.id) }
}
