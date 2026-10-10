import pLimit from 'p-limit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { ReviewerAssignmentRole } from '@/lib/adjudication/types'
import {
  currentFinalEvent,
  decisionRequiresReview,
  isRecordComplete,
  latestDecisionByResult,
  latestSecondReview,
} from '@/lib/adjudication/policy'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { activeAssignmentsForReviewer } from '@/lib/review/assignments'

/**
 * Review inbox: the runs that need this user's human review work.
 *
 * Scope (server-enforced, never widened by input):
 *   - runs where the user holds an ACTIVE (unrevoked) reviewer assignment
 *   - runs the user owns, that finished screening, are not approved, and
 *     still have required records without a complete human disposition
 * Deleted and synthetic canary runs are always excluded. Owned approved runs
 * are excluded. Assigned approved runs are listed as 'approved' (not pending)
 * so a reviewer can see that their work was released.
 *
 * Open-record counts reuse lib/adjudication/policy.ts, the same rules the run
 * page uses, and load evidence with fetchAllRows so large runs are not
 * truncated at the PostgREST response cap.
 */

type Db = SupabaseClient<Database>

export type InboxState =
  | 'in_progress'      // screening has not finished
  | 'failed'           // screening failed or was cancelled; cannot be reviewed
  | 'pending'          // required records still need a human disposition
  | 'awaiting_approval'// all required records done; run-level review/approval outstanding
  | 'approved'         // released; nothing pending

export interface InboxItem {
  run_id: string
  device_name: string | null
  manufacturer: string | null
  period_from: string | null
  period_to: string | null
  run_status: string
  review_status: string
  coverage_incomplete: boolean
  open_requirements: number | null
  second_review_pending: number | null
  required_records: number | null
  assignment_role: ReviewerAssignmentRole | null
  is_owner: boolean
  state: InboxState
  completed_at: string | null
}

export interface InboxResult {
  items: InboxItem[]
  /** True when the owned-run scan hit its cap; older owned runs were not scanned. */
  owned_truncated: boolean
}

/** Owned runs scanned per request. Assigned runs are never capped. */
export const OWNED_RUN_SCAN_LIMIT = 200
const IN_CHUNK = 100
const COUNT_CONCURRENCY = 4

const RUN_COLUMNS = `
  id, user_id, status, review_status, completed_at, created_at,
  period_from, period_to, search_period_from, search_period_to,
  profile_snapshot, is_synthetic_canary, deleted_at,
  product_profiles ( device_name, manufacturer )
`.trim()

interface RunRow {
  id: string
  user_id: string
  status: string
  review_status: string | null
  completed_at: string | null
  created_at: string
  period_from: string | null
  period_to: string | null
  search_period_from: string | null
  search_period_to: string | null
  profile_snapshot: unknown
  is_synthetic_canary: boolean
  deleted_at: string | null
  product_profiles: { device_name: string | null; manufacturer: string | null }
    | { device_name: string | null; manufacturer: string | null }[]
    | null
}

export interface OpenRecordCounts {
  required_records: number
  open_requirements: number
  second_review_pending: number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function profileOf(run: RunRow): { device_name: string | null; manufacturer: string | null } {
  const snapshot = run.profile_snapshot
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const record = snapshot as Record<string, unknown>
    if (typeof record.device_name === 'string') {
      return {
        device_name: record.device_name,
        manufacturer: typeof record.manufacturer === 'string' ? record.manufacturer : null,
      }
    }
  }
  const live = Array.isArray(run.product_profiles) ? run.product_profiles[0] ?? null : run.product_profiles
  return { device_name: live?.device_name ?? null, manufacturer: live?.manufacturer ?? null }
}

function isFinished(status: string): boolean {
  return status === 'complete' || status === 'degraded'
}

function isFailed(status: string): boolean {
  return status === 'error' || status === 'cancelled'
}

/**
 * Required/open record counts for one run, with the same semantics as the
 * adjudication API summary: a record is required when it has an explicit
 * review requirement or its latest AI decision is relevant, uncertain or
 * filter_failed; it is open until it has a current final disposition and any
 * required agreeing second review.
 */
export async function countOpenRecords(
  db: Db,
  runId: string,
): Promise<{ data: OpenRecordCounts | null; error: string | null }> {
  const [decisions, requirements, events] = await Promise.all([
    fetchAllRows((from, to) => db.from('filter_decisions')
      .select('id, fsn_result_id, decision, decided_at')
      .eq('search_run_id', runId)
      .order('decided_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows((from, to) => db.from('review_requirements')
      .select('id, fsn_result_id')
      .eq('search_run_id', runId)
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows((from, to) => db.from('human_adjudication_events')
      .select('id, fsn_result_id, phase, disposition, reviewer_id, supersedes_event_id, review_of_event_id, requires_second_review, created_at')
      .eq('search_run_id', runId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)),
  ])
  const error = decisions.error ?? requirements.error ?? events.error
  if (error) return { data: null, error: error.message }

  const latest = latestDecisionByResult(decisions.data)
  const required = new Set<string>(requirements.data.map((row) => row.fsn_result_id))
  for (const [resultId, decision] of latest) {
    if (decisionRequiresReview(decision)) required.add(resultId)
  }

  type EventRow = (typeof events.data)[number]
  const eventsByResult = new Map<string, EventRow[]>()
  for (const event of events.data) {
    const list = eventsByResult.get(event.fsn_result_id)
    if (list) list.push(event)
    else eventsByResult.set(event.fsn_result_id, [event])
  }

  let open = 0
  let secondPending = 0
  for (const resultId of required) {
    const resultEvents = (eventsByResult.get(resultId) ?? []).map((event) => ({
      ...event,
      phase: event.phase as 'provisional_blind' | 'final' | 'second_review',
      disposition: event.disposition as 'relevant' | 'uncertain' | 'excluded',
    }))
    const finalEvent = currentFinalEvent(resultEvents)
    const secondReview = latestSecondReview(resultEvents, finalEvent)
    if (!isRecordComplete(finalEvent, secondReview)) {
      open += 1
      if (finalEvent?.requires_second_review) secondPending += 1
    }
  }

  return {
    data: { required_records: required.size, open_requirements: open, second_review_pending: secondPending },
    error: null,
  }
}

function stateFor(run: RunRow, counts: OpenRecordCounts | null): InboxState {
  if (run.review_status === 'approved') return 'approved'
  if (isFailed(run.status)) return 'failed'
  if (!isFinished(run.status)) return 'in_progress'
  if (counts && counts.open_requirements > 0) return 'pending'
  return 'awaiting_approval'
}

async function loadRunsByIds(db: Db, ids: string[]): Promise<{ data: RunRow[]; error: string | null }> {
  const rows: RunRow[] = []
  for (const ids100 of chunk([...new Set(ids)], IN_CHUNK)) {
    const { data, error } = await db
      .from('search_runs')
      .select(RUN_COLUMNS)
      .in('id', ids100)
      .eq('is_synthetic_canary', false)
      .is('deleted_at', null)
    if (error) return { data: [], error: error.message }
    rows.push(...((data ?? []) as unknown as RunRow[]))
  }
  return { data: rows, error: null }
}

export async function loadReviewInbox(
  db: Db,
  userId: string,
): Promise<{ data: InboxResult | null; error: string | null }> {
  const assignments = await activeAssignmentsForReviewer(db, userId)
  if (assignments.error) return { data: null, error: assignments.error.message }
  const roleByRun = new Map(assignments.data.map((a) => [a.search_run_id, a.assignment_role]))

  const [assignedRuns, ownedRuns] = await Promise.all([
    loadRunsByIds(db, [...roleByRun.keys()]),
    db.from('search_runs')
      .select(RUN_COLUMNS)
      .eq('user_id', userId)
      .eq('is_synthetic_canary', false)
      .is('deleted_at', null)
      .in('review_status', ['draft', 'reviewed'])
      .in('status', ['complete', 'degraded'])
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(OWNED_RUN_SCAN_LIMIT + 1),
  ])
  if (assignedRuns.error) return { data: null, error: assignedRuns.error }
  if (ownedRuns.error) return { data: null, error: ownedRuns.error.message }

  const owned = (ownedRuns.data ?? []) as unknown as RunRow[]
  const ownedTruncated = owned.length > OWNED_RUN_SCAN_LIMIT

  const candidates = new Map<string, RunRow>()
  // Defence in depth: an assigned run is only kept when the assignment query
  // returned it for this user; an owned run only when user_id matches.
  for (const run of assignedRuns.data) {
    if (roleByRun.has(run.id) && run.is_synthetic_canary === false && run.deleted_at === null) {
      candidates.set(run.id, run)
    }
  }
  for (const run of owned.slice(0, OWNED_RUN_SCAN_LIMIT)) {
    if (run.user_id === userId && run.is_synthetic_canary === false && run.deleted_at === null) {
      candidates.set(run.id, run)
    }
  }

  const limit = pLimit(COUNT_CONCURRENCY)
  let countError: string | null = null
  const built = await Promise.all([...candidates.values()].map((run) => limit(async (): Promise<InboxItem | null> => {
    const isOwner = run.user_id === userId
    const assignmentRole = roleByRun.get(run.id) ?? null
    const reviewStatus = run.review_status ?? 'draft'

    let counts: OpenRecordCounts | null = null
    if (reviewStatus !== 'approved' && isFinished(run.status)) {
      const result = await countOpenRecords(db, run.id)
      if (result.error) {
        countError = result.error
        return null
      }
      counts = result.data
    }

    // Owned-only runs stay in the inbox only while required records remain open.
    if (!assignmentRole && (reviewStatus === 'approved' || (counts?.open_requirements ?? 0) === 0)) {
      return null
    }

    const profile = profileOf(run)
    return {
      run_id: run.id,
      device_name: profile.device_name,
      manufacturer: profile.manufacturer,
      period_from: run.search_period_from ?? run.period_from,
      period_to: run.search_period_to ?? run.period_to,
      run_status: run.status,
      review_status: reviewStatus,
      coverage_incomplete: run.status !== 'complete',
      open_requirements: counts?.open_requirements ?? null,
      second_review_pending: counts?.second_review_pending ?? null,
      required_records: counts?.required_records ?? null,
      assignment_role: assignmentRole,
      is_owner: isOwner,
      state: stateFor(run, counts),
      completed_at: run.completed_at,
    }
  })))

  // A missing count would understate pending work. Fail the whole inbox.
  if (countError) return { data: null, error: countError }

  const order: Record<InboxState, number> = {
    pending: 0, awaiting_approval: 1, in_progress: 2, failed: 3, approved: 4,
  }
  const items = built
    .filter((item): item is InboxItem => item !== null)
    .sort((a, b) =>
      order[a.state] - order[b.state]
      || (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
      || a.run_id.localeCompare(b.run_id))

  return { data: { items, owned_truncated: ownedTruncated }, error: null }
}
