import type { EffectiveDecision } from './effective'

/**
 * Previous-cycle comparison. Pure: no I/O, no clock, no regulatory judgement.
 *
 * Two runs of the same device profile are compared record by record (identity
 * = source_db + external_id) and scope by scope. The output separates:
 *   - scope changes (profile fields, search terms, source set, period), which
 *     change what was searched for, from
 *   - record differences (new / removed / modified / decision changed), which
 *     describe what the sources returned and how it was assessed.
 *
 * Absence is only reported as "removed" when both runs searched that source
 * with intact coverage and the record's date falls inside the current window.
 * Otherwise the absence is unverified and reported separately with a reason.
 * Explanations are factual sentences built from counts, ids and field names.
 */

export type SourceCoverageStatus =
  | 'complete'
  | 'complete_with_fallback'
  | 'empty'
  | 'partial'
  | 'failed'
  /** Source selected for the run but no coverage outcome was recorded. */
  | 'not_recorded'
  /** Source was not selected for this run. */
  | 'not_searched'

export interface SourceBreakdownInput {
  source: string
  status: string
  requested_from?: string | null
  requested_to?: string | null
}

export interface CycleRunSummary {
  id: string
  status: string
  review_status: string | null
  created_at: string
  period_from: string | null
  period_to: string | null
  dbs_searched: string[]
  source_breakdown: SourceBreakdownInput[]
  profile_snapshot: Record<string, unknown> | null
  terms_used: Record<string, unknown> | null
}

export interface CycleRecordInput {
  result_id: string
  source_db: string
  external_id: string | null
  title: string
  fsn_date: string | null
  source_url: string | null
  content_hash: string | null
  attachment_digest: string | null
  decision: EffectiveDecision
}

export interface CycleSide {
  run: CycleRunSummary
  records: CycleRecordInput[]
}

export interface RecordRef {
  key: string
  source_db: string
  external_id: string
  result_id: string
  title: string
  fsn_date: string | null
  source_url: string | null
}

/**
 * Why a record is new relative to the previous run:
 * - previous_window_searched: the previous run searched this source with intact
 *   coverage over a window containing the record date, and did not return it.
 * - outside_previous_window: the record date lies outside the previous window.
 * - source_not_previously_searched: the previous run did not search this source.
 * - previous_coverage_degraded: the previous run's coverage for this source was
 *   partial, failed or not recorded, so the earlier absence is not verified.
 * - date_unknown: the record has no date and the windows differ.
 */
export type NewRecordContext =
  | 'previous_window_searched'
  | 'outside_previous_window'
  | 'source_not_previously_searched'
  | 'previous_coverage_degraded'
  | 'date_unknown'

export interface NewRecord extends RecordRef {
  decision: EffectiveDecision
  context: NewRecordContext
}

export interface RemovedRecord extends RecordRef {
  previous_decision: EffectiveDecision
}

export type UnverifiedAbsenceReason =
  | 'source_not_searched'
  | 'coverage_degraded'
  | 'date_unverifiable'

export interface UnverifiedAbsence extends RemovedRecord {
  reason: UnverifiedAbsenceReason
  current_status: SourceCoverageStatus
  previous_status: SourceCoverageStatus
}

export type ContentChange = 'record_content' | 'attachments'

export interface ModifiedRecord extends RecordRef {
  previous_result_id: string
  changes: ContentChange[]
  previous_content_hash: string | null
  current_content_hash: string | null
  previous_attachment_digest: string | null
  current_attachment_digest: string | null
}

export interface DecisionChangedRecord extends RecordRef {
  previous_result_id: string
  from: EffectiveDecision
  to: EffectiveDecision
}

export interface FieldChange {
  field: string
  from: unknown
  to: unknown
}

export interface SourceCoverageComparison {
  source: string
  current_status: SourceCoverageStatus
  previous_status: SourceCoverageStatus
  /** True when both runs searched the source with intact coverage. */
  compared: boolean
}

export interface CycleComparison {
  current_run_id: string
  previous_run_id: string | null
  previous_run: {
    id: string
    created_at: string
    status: string
    review_status: string | null
    period_from: string | null
    period_to: string | null
  } | null
  records: {
    new: NewRecord[]
    removed: RemovedRecord[]
    unverified_absence: UnverifiedAbsence[]
    /** Previous records dated outside the current search window: not expected. */
    outside_current_period: RemovedRecord[]
    modified: ModifiedRecord[]
    decision_changed: DecisionChangedRecord[]
    unchanged_count: number
    /** Matched records where a hash or digest is missing on one side. */
    content_unverified_count: number
    /** Records without an external_id cannot be matched across runs. */
    unidentified: { current: number; previous: number }
    /** Additional rows sharing an identity with an earlier row in the same run. */
    duplicate_identity: { current: number; previous: number }
  }
  scope_changes: {
    /** False when either run lacks a profile snapshot. */
    profile_snapshot_available: boolean
    profile_fields_changed: FieldChange[]
    /** null when either run lacks recorded terms. */
    terms_changed: boolean | null
    terms_fields_changed: FieldChange[]
    sources_added: string[]
    sources_removed: string[]
    /** Whole days strictly between the two periods; null if a period is missing. */
    period_gap_days: number | null
    /** Inclusive days both periods share; null if a period is missing. */
    period_overlap_days: number | null
  }
  source_coverage: SourceCoverageComparison[]
  completeness: { comparable: boolean; reasons: string[] }
  explanations: string[]
}

const DEGRADED_STATUSES: ReadonlySet<SourceCoverageStatus> = new Set([
  'partial', 'failed', 'not_recorded', 'not_searched',
])
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'complete', 'complete_with_fallback', 'empty', 'partial', 'failed',
])
/** Snapshot keys that are not profile scope (source choice lives in dbs_searched). */
const IGNORED_SNAPSHOT_KEYS: ReadonlySet<string> = new Set(['default_dbs'])

export function isDegradedCoverage(status: SourceCoverageStatus): boolean {
  return DEGRADED_STATUSES.has(status)
}

export function coverageStatus(run: CycleRunSummary, source: string): SourceCoverageStatus {
  if (!run.dbs_searched.includes(source)) return 'not_searched'
  const entry = run.source_breakdown.find((item) => item.source === source)
  if (!entry) return 'not_recorded'
  // An unknown status string is treated as unverified rather than complete.
  return KNOWN_STATUSES.has(entry.status) ? entry.status as SourceCoverageStatus : 'not_recorded'
}

export function recordKey(sourceDb: string, externalId: string): string {
  return `${sourceDb}::${externalId}`
}

function toDay(value: string | null | undefined): string | null {
  if (!value) return null
  const day = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

interface Window { from: string; to: string }

function runWindow(run: CycleRunSummary): Window | null {
  const from = toDay(run.period_from)
  const to = toDay(run.period_to)
  return from && to ? { from, to } : null
}

function sourceWindow(run: CycleRunSummary, source: string): Window | null {
  const entry = run.source_breakdown.find((item) => item.source === source)
  const from = toDay(entry?.requested_from)
  const to = toDay(entry?.requested_to)
  return from && to ? { from, to } : runWindow(run)
}

function inWindow(day: string, window: Window): boolean {
  return day >= window.from && day <= window.to
}

function windowContains(outer: Window, inner: Window): boolean {
  return outer.from <= inner.from && outer.to >= inner.to
}

export function periodRelation(
  current: { from: string | null; to: string | null },
  previous: { from: string | null; to: string | null },
): { gap_days: number | null; overlap_days: number | null } {
  const cf = toDay(current.from)
  const ct = toDay(current.to)
  const pf = toDay(previous.from)
  const pt = toDay(previous.to)
  if (!cf || !ct || !pf || !pt) return { gap_days: null, overlap_days: null }
  const start = Math.max(dayNumber(cf), dayNumber(pf))
  const end = Math.min(dayNumber(ct), dayNumber(pt))
  if (end >= start) return { gap_days: 0, overlap_days: end - start + 1 }
  return { gap_days: start - end - 1, overlap_days: 0 }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort()
    .filter((key) => obj[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`
}

function normalizeTermValue(value: unknown): unknown {
  // Term lists are sets; their order carries no meaning.
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return [...value].sort()
  }
  return value
}

function diffFields(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  options: { ignore?: ReadonlySet<string>; normalize?: (value: unknown) => unknown } = {},
): FieldChange[] {
  const normalize = options.normalize ?? ((value: unknown) => value)
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter((key) => !options.ignore?.has(key))
    .sort()
  const changes: FieldChange[] = []
  for (const key of keys) {
    const from = previous[key] ?? null
    const to = current[key] ?? null
    if (stableStringify(normalize(from)) !== stableStringify(normalize(to))) {
      changes.push({ field: key, from, to })
    }
  }
  return changes
}

interface IndexedSide {
  byKey: Map<string, CycleRecordInput & { external_id: string }>
  unidentified: number
  duplicates: number
}

function indexRecords(records: CycleRecordInput[]): IndexedSide {
  const byKey = new Map<string, CycleRecordInput & { external_id: string }>()
  let unidentified = 0
  let duplicates = 0
  const ordered = [...records].sort((a, b) => a.result_id.localeCompare(b.result_id))
  for (const record of ordered) {
    if (!record.external_id) {
      unidentified++
      continue
    }
    const key = recordKey(record.source_db, record.external_id)
    if (byKey.has(key)) {
      duplicates++
      continue
    }
    byKey.set(key, record as CycleRecordInput & { external_id: string })
  }
  return { byKey, unidentified, duplicates }
}

function ref(key: string, record: CycleRecordInput & { external_id: string }): RecordRef {
  return {
    key,
    source_db: record.source_db,
    external_id: record.external_id,
    result_id: record.result_id,
    title: record.title,
    fsn_date: record.fsn_date,
    source_url: record.source_url,
  }
}

function byKeyOrder<T extends { key: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.key.localeCompare(b.key))
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function list(values: string[]): string {
  return values.join(', ')
}

function sameDecision(a: EffectiveDecision, b: EffectiveDecision): boolean {
  return a.decision === b.decision
}

function emptyResult(current: CycleSide, reason: string): CycleComparison {
  const sources = [...new Set(current.run.dbs_searched)].sort()
  return {
    current_run_id: current.run.id,
    previous_run_id: null,
    previous_run: null,
    records: {
      new: [], removed: [], unverified_absence: [], outside_current_period: [],
      modified: [], decision_changed: [], unchanged_count: 0, content_unverified_count: 0,
      unidentified: { current: 0, previous: 0 }, duplicate_identity: { current: 0, previous: 0 },
    },
    scope_changes: {
      profile_snapshot_available: false,
      profile_fields_changed: [],
      terms_changed: null,
      terms_fields_changed: [],
      sources_added: [],
      sources_removed: [],
      period_gap_days: null,
      period_overlap_days: null,
    },
    source_coverage: sources.map((source) => ({
      source,
      current_status: coverageStatus(current.run, source),
      previous_status: 'not_searched',
      compared: false,
    })),
    completeness: { comparable: false, reasons: [reason] },
    explanations: [`${reason} No record-level comparison was made.`],
  }
}

export function compareCycles(current: CycleSide, previous: CycleSide | null): CycleComparison {
  if (!previous) {
    return emptyResult(current, 'No earlier complete or degraded run exists for this profile.')
  }

  const cur = current.run
  const prev = previous.run

  // ── Source coverage ────────────────────────────────────────────────────
  const curSources = new Set(cur.dbs_searched)
  const prevSources = new Set(prev.dbs_searched)
  const allSources = [...new Set([...curSources, ...prevSources])].sort()
  const sourceCoverage: SourceCoverageComparison[] = allSources.map((source) => {
    const current_status = coverageStatus(cur, source)
    const previous_status = coverageStatus(prev, source)
    return {
      source,
      current_status,
      previous_status,
      compared: !isDegradedCoverage(current_status) && !isDegradedCoverage(previous_status),
    }
  })
  const coverageBySource = new Map(sourceCoverage.map((item) => [item.source, item]))
  const sourcesAdded = allSources.filter((source) => curSources.has(source) && !prevSources.has(source))
  const sourcesRemoved = allSources.filter((source) => prevSources.has(source) && !curSources.has(source))

  // ── Completeness ───────────────────────────────────────────────────────
  const reasons: string[] = []
  for (const [label, run] of [['current run', cur], [`previous run ${prev.id}`, prev]] as const) {
    if (run.status === 'degraded') reasons.push(`The ${label} finished with status degraded.`)
    else if (run.status !== 'complete') reasons.push(`The ${label} has status ${run.status}, not complete.`)
  }
  for (const item of sourceCoverage) {
    if (!curSources.has(item.source) || !prevSources.has(item.source)) continue
    const sides: string[] = []
    if (isDegradedCoverage(item.current_status)) sides.push(`current run: ${item.current_status}`)
    if (isDegradedCoverage(item.previous_status)) sides.push(`previous run: ${item.previous_status}`)
    if (sides.length > 0) reasons.push(`Coverage for ${item.source} was not intact (${sides.join('; ')}).`)
  }
  const degradedOneSided = sourceCoverage.filter((item) =>
    (curSources.has(item.source) !== prevSources.has(item.source))
    && (isDegradedCoverage(item.current_status) && item.current_status !== 'not_searched'
      || isDegradedCoverage(item.previous_status) && item.previous_status !== 'not_searched'))
  for (const item of degradedOneSided) {
    const side = curSources.has(item.source) ? `current run: ${item.current_status}` : `previous run: ${item.previous_status}`
    reasons.push(`Coverage for ${item.source} was not intact (${side}).`)
  }
  const comparable = reasons.length === 0

  // ── Scope changes ──────────────────────────────────────────────────────
  const profileAvailable = Boolean(cur.profile_snapshot && prev.profile_snapshot)
  const profileFieldsChanged = profileAvailable
    ? diffFields(prev.profile_snapshot ?? {}, cur.profile_snapshot ?? {}, { ignore: IGNORED_SNAPSHOT_KEYS })
    : []
  const termsAvailable = Boolean(cur.terms_used && prev.terms_used)
  const termsFieldsChanged = termsAvailable
    ? diffFields(prev.terms_used ?? {}, cur.terms_used ?? {}, { normalize: normalizeTermValue })
    : []
  const period = periodRelation(
    { from: cur.period_from, to: cur.period_to },
    { from: prev.period_from, to: prev.period_to },
  )

  // ── Records ────────────────────────────────────────────────────────────
  const curIndex = indexRecords(current.records)
  const prevIndex = indexRecords(previous.records)

  const added: NewRecord[] = []
  const removed: RemovedRecord[] = []
  const unverified: UnverifiedAbsence[] = []
  const outsidePeriod: RemovedRecord[] = []
  const modified: ModifiedRecord[] = []
  const decisionChanged: DecisionChangedRecord[] = []
  let unchanged = 0
  let contentUnverified = 0

  for (const [key, record] of curIndex.byKey) {
    const before = prevIndex.byKey.get(key)
    if (!before) {
      added.push({ ...ref(key, record), decision: record.decision, context: newRecordContext(record, prev, coverageBySource) })
      continue
    }
    const changes: ContentChange[] = []
    let verifiable = true
    if (record.content_hash && before.content_hash) {
      if (record.content_hash !== before.content_hash) changes.push('record_content')
    } else {
      verifiable = false
    }
    // A missing digest on either side means "not verified", not "changed".
    if (record.attachment_digest && before.attachment_digest) {
      if (record.attachment_digest !== before.attachment_digest) changes.push('attachments')
    } else if (record.attachment_digest || before.attachment_digest) {
      verifiable = false
    }
    if (changes.length > 0) {
      modified.push({
        ...ref(key, record),
        previous_result_id: before.result_id,
        changes,
        previous_content_hash: before.content_hash,
        current_content_hash: record.content_hash,
        previous_attachment_digest: before.attachment_digest,
        current_attachment_digest: record.attachment_digest,
      })
    } else if (!verifiable) {
      contentUnverified++
    }
    const decisionDiffers = !sameDecision(before.decision, record.decision)
    if (decisionDiffers) {
      decisionChanged.push({
        ...ref(key, record),
        previous_result_id: before.result_id,
        from: before.decision,
        to: record.decision,
      })
    }
    if (changes.length === 0 && !decisionDiffers) unchanged++
  }

  const currentWindow = runWindow(cur)
  for (const [key, record] of prevIndex.byKey) {
    if (curIndex.byKey.has(key)) continue
    const base: RemovedRecord = { ...ref(key, record), previous_decision: record.decision }
    const coverage = coverageBySource.get(record.source_db) ?? {
      source: record.source_db,
      current_status: coverageStatus(cur, record.source_db),
      previous_status: coverageStatus(prev, record.source_db),
      compared: false,
    }
    const statusFields = { current_status: coverage.current_status, previous_status: coverage.previous_status }
    if (!curSources.has(record.source_db)) {
      unverified.push({ ...base, ...statusFields, reason: 'source_not_searched' })
      continue
    }
    if (isDegradedCoverage(coverage.current_status) || isDegradedCoverage(coverage.previous_status)) {
      unverified.push({ ...base, ...statusFields, reason: 'coverage_degraded' })
      continue
    }
    const day = toDay(record.fsn_date)
    const curSourceWindow = sourceWindow(cur, record.source_db) ?? currentWindow
    const prevSourceWindow = sourceWindow(prev, record.source_db)
    if (day && curSourceWindow) {
      if (inWindow(day, curSourceWindow)) removed.push(base)
      else outsidePeriod.push(base)
      continue
    }
    if (!day && curSourceWindow && prevSourceWindow && windowContains(curSourceWindow, prevSourceWindow)) {
      removed.push(base)
      continue
    }
    unverified.push({ ...base, ...statusFields, reason: 'date_unverifiable' })
  }

  const records = {
    new: byKeyOrder(added),
    removed: byKeyOrder(removed),
    unverified_absence: byKeyOrder(unverified),
    outside_current_period: byKeyOrder(outsidePeriod),
    modified: byKeyOrder(modified),
    decision_changed: byKeyOrder(decisionChanged),
    unchanged_count: unchanged,
    content_unverified_count: contentUnverified,
    unidentified: { current: curIndex.unidentified, previous: prevIndex.unidentified },
    duplicate_identity: { current: curIndex.duplicates, previous: prevIndex.duplicates },
  }

  const scopeChanges: CycleComparison['scope_changes'] = {
    profile_snapshot_available: profileAvailable,
    profile_fields_changed: profileFieldsChanged,
    terms_changed: termsAvailable ? termsFieldsChanged.length > 0 : null,
    terms_fields_changed: termsFieldsChanged,
    sources_added: sourcesAdded,
    sources_removed: sourcesRemoved,
    period_gap_days: period.gap_days,
    period_overlap_days: period.overlap_days,
  }

  return {
    current_run_id: cur.id,
    previous_run_id: prev.id,
    previous_run: {
      id: prev.id,
      created_at: prev.created_at,
      status: prev.status,
      review_status: prev.review_status,
      period_from: prev.period_from,
      period_to: prev.period_to,
    },
    records,
    scope_changes: scopeChanges,
    source_coverage: sourceCoverage,
    completeness: { comparable, reasons },
    explanations: buildExplanations({ cur, prev, records, scope: scopeChanges, sourceCoverage, comparable }),
  }
}

function newRecordContext(
  record: CycleRecordInput,
  prev: CycleRunSummary,
  coverageBySource: Map<string, SourceCoverageComparison>,
): NewRecordContext {
  if (!prev.dbs_searched.includes(record.source_db)) return 'source_not_previously_searched'
  const previousStatus = coverageBySource.get(record.source_db)?.previous_status ?? coverageStatus(prev, record.source_db)
  if (isDegradedCoverage(previousStatus)) return 'previous_coverage_degraded'
  const day = toDay(record.fsn_date)
  const window = sourceWindow(prev, record.source_db)
  if (!day || !window) return 'date_unknown'
  return inWindow(day, window) ? 'previous_window_searched' : 'outside_previous_window'
}

function buildExplanations(input: {
  cur: CycleRunSummary
  prev: CycleRunSummary
  records: CycleComparison['records']
  scope: CycleComparison['scope_changes']
  sourceCoverage: SourceCoverageComparison[]
  comparable: boolean
}): string[] {
  const { cur, prev, records, scope, sourceCoverage, comparable } = input
  const lines: string[] = []

  lines.push(
    `Compared with previous run ${prev.id} (created ${prev.created_at.slice(0, 10)}, status ${prev.status}, review status ${prev.review_status ?? 'not recorded'}).`,
  )

  // Scope: what was searched for.
  lines.push(
    `Search period: current ${cur.period_from ?? 'not recorded'} to ${cur.period_to ?? 'not recorded'}; previous ${prev.period_from ?? 'not recorded'} to ${prev.period_to ?? 'not recorded'}`
    + (scope.period_gap_days === null
      ? '; the period relation could not be computed.'
      : scope.period_overlap_days && scope.period_overlap_days > 0
        ? `; the periods overlap by ${plural(scope.period_overlap_days, 'day')}.`
        : `; ${plural(scope.period_gap_days, 'day')} between the periods were searched by neither run.`),
  )
  if (!scope.profile_snapshot_available) {
    lines.push('Profile fields could not be compared because at least one run has no stored profile snapshot.')
  } else if (scope.profile_fields_changed.length > 0) {
    lines.push(
      `Profile fields changed between the runs: ${list(scope.profile_fields_changed.map((change) => change.field))}. This is a change in search scope, not new source evidence.`,
    )
  } else {
    lines.push('Profile fields recorded for both runs are identical.')
  }
  if (scope.terms_changed === null) {
    lines.push('Search terms could not be compared because at least one run has no recorded terms.')
  } else if (scope.terms_changed) {
    lines.push(
      `Search terms changed between the runs: ${list(scope.terms_fields_changed.map((change) => change.field))}. This is a change in search scope, not new source evidence.`,
    )
  }
  if (scope.sources_added.length > 0) {
    lines.push(`Sources searched only in the current run: ${list(scope.sources_added)}.`)
  }
  if (scope.sources_removed.length > 0) {
    lines.push(`Sources searched only in the previous run: ${list(scope.sources_removed)}.`)
  }

  // Records: what the sources returned.
  if (records.new.length > 0) {
    const byContext = (context: NewRecordContext) => records.new.filter((record) => record.context === context).length
    const parts = [
      [byContext('previous_window_searched'), 'dated inside a window the previous run searched with intact coverage'],
      [byContext('outside_previous_window'), 'dated outside the previous search window'],
      [byContext('source_not_previously_searched'), 'from sources the previous run did not search'],
      [byContext('previous_coverage_degraded'), 'from sources whose previous coverage was not intact'],
      [byContext('date_unknown'), 'without a usable date'],
    ] as const
    lines.push(
      `${plural(records.new.length, 'record')} returned by the current run ${records.new.length === 1 ? 'was' : 'were'} not returned by the previous run: `
      + parts.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`).join('; ') + '.',
    )
  } else {
    lines.push('No record returned by the current run is absent from the previous run.')
  }
  if (records.removed.length > 0) {
    lines.push(
      `${plural(records.removed.length, 'record')} returned by the previous run ${records.removed.length === 1 ? 'was' : 'were'} not returned by the current run, although both runs searched the source with intact coverage and the record date lies inside the current window: ${list(records.removed.map((record) => record.key))}.`,
    )
  }
  if (records.unverified_absence.length > 0) {
    const reasonCount = (reason: UnverifiedAbsenceReason) => records.unverified_absence.filter((record) => record.reason === reason).length
    const parts = [
      [reasonCount('coverage_degraded'), 'source coverage was not intact in one of the runs'],
      [reasonCount('source_not_searched'), 'the current run did not search the source'],
      [reasonCount('date_unverifiable'), 'the record date or search window could not be checked'],
    ] as const
    lines.push(
      `${plural(records.unverified_absence.length, 'record')} from the previous run ${records.unverified_absence.length === 1 ? 'is' : 'are'} absent from the current run, but the absence is not verified: `
      + parts.filter(([count]) => count > 0).map(([count, label]) => `${count} because ${label}`).join('; ') + '.',
    )
  }
  if (records.outside_current_period.length > 0) {
    lines.push(
      `${plural(records.outside_current_period.length, 'record')} from the previous run ${records.outside_current_period.length === 1 ? 'is' : 'are'} dated outside the current search window and ${records.outside_current_period.length === 1 ? 'was' : 'were'} not expected in this run.`,
    )
  }
  if (records.modified.length > 0) {
    const content = records.modified.filter((record) => record.changes.includes('record_content')).length
    const attachments = records.modified.filter((record) => record.changes.includes('attachments')).length
    lines.push(
      `${plural(records.modified.length, 'record')} present in both runs ${records.modified.length === 1 ? 'has' : 'have'} different stored source content (${content} with changed record content, ${attachments} with changed attached documents).`,
    )
  }
  if (records.content_unverified_count > 0) {
    lines.push(
      `${plural(records.content_unverified_count, 'matched record')} could not be checked for content changes because a content hash or attachment digest is missing in one run.`,
    )
  }
  if (records.decision_changed.length > 0) {
    const human = records.decision_changed.filter((record) => record.from.origin === 'human' || record.to.origin === 'human').length
    const pending = records.decision_changed.filter((record) =>
      record.to.human_state === 'pending_second_review' || record.from.human_state === 'pending_second_review').length
    lines.push(
      `${plural(records.decision_changed.length, 'record')} present in both runs ${records.decision_changed.length === 1 ? 'has' : 'have'} a different effective decision; ${human} of these involve a final human disposition`
      + (pending > 0 ? ` and ${pending} involve a disposition still awaiting independent second review` : '') + '.',
    )
  }
  lines.push(`${plural(records.unchanged_count, 'record')} present in both runs ${records.unchanged_count === 1 ? 'has' : 'have'} no detected content or decision change.`)
  if (records.unidentified.current > 0 || records.unidentified.previous > 0) {
    lines.push(
      `Records without an external identifier were not matched across runs (current: ${records.unidentified.current}, previous: ${records.unidentified.previous}).`,
    )
  }
  if (records.duplicate_identity.current > 0 || records.duplicate_identity.previous > 0) {
    lines.push(
      `Rows sharing a source identifier within one run were compared once (extra rows: current ${records.duplicate_identity.current}, previous ${records.duplicate_identity.previous}).`,
    )
  }

  if (comparable) return lines

  const degradedSources = sourceCoverage
    .filter((item) => isDegradedCoverage(item.current_status) && item.current_status !== 'not_searched'
      || isDegradedCoverage(item.previous_status) && item.previous_status !== 'not_searched')
    .map((item) => item.source)
  const runSides = [
    ...(cur.status !== 'complete' ? [`the current run status is ${cur.status}`] : []),
    ...(prev.status !== 'complete' ? [`the previous run status is ${prev.status}`] : []),
    ...(degradedSources.length > 0 ? [`coverage was not intact for ${list(degradedSources)}`] : []),
  ]
  const limitation = runSides.length > 0
    ? ` Limitation: not a like-for-like comparison because ${runSides.join(' and ')}.`
    : ' Limitation: not a like-for-like comparison; see the completeness reasons.'
  return lines.map((line) => line + limitation)
}
