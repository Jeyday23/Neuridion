import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, type FakeDb, type Row } from './fake-supabase'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  db: null as unknown as FakeDb,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mocks.db),
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}))

import { GET } from '@/app/api/review-inbox/route'
import { countOpenRecords } from '@/lib/review/inbox'

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

let seq = 0
function uuid(prefix: string) {
  seq += 1
  return `${prefix}-0000-4000-8000-${seq.toString(16).padStart(12, '0')}`
}

function run(overrides: Partial<Row> & { id: string; user_id: string }): Row {
  return {
    status: 'complete', review_status: 'draft', completed_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T09:00:00Z',
    period_from: '2026-07-01', period_to: '2026-09-30', search_period_from: null, search_period_to: null,
    profile_snapshot: { device_name: 'Infusion pump', manufacturer: 'Acme' },
    is_synthetic_canary: false, deleted_at: null, product_profiles: null,
    ...overrides,
  }
}

/** Adds one result with an AI 'relevant' decision (always requires review). */
function requiredRecord(tables: Record<string, Row[]>, runId: string, opts: { final?: boolean } = {}) {
  const resultId = uuid('22222222')
  const decisionId = uuid('33333333')
  tables.filter_decisions.push({
    id: decisionId, search_run_id: runId, fsn_result_id: resultId, decision: 'relevant',
    decided_at: '2026-10-01T09:30:00Z',
  })
  if (opts.final) {
    tables.human_adjudication_events.push({
      id: uuid('44444444'), search_run_id: runId, fsn_result_id: resultId, phase: 'final',
      disposition: 'relevant', reviewer_id: ME, supersedes_event_id: null, review_of_event_id: null,
      requires_second_review: false, created_at: '2026-10-02T09:00:00Z',
    })
  }
  return resultId
}

function assignment(runId: string, reviewerId: string, role = 'primary'): Row {
  return {
    id: uuid('55555555'), search_run_id: runId, reviewer_id: reviewerId, assigned_by: OTHER,
    assignment_role: role, assigned_at: '2026-10-01T11:00:00Z',
  }
}

async function inbox() {
  const response = await GET()
  return { status: response.status, body: await response.json() }
}

describe('review inbox scoping', () => {
  let tables: Record<string, Row[]>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null })
    tables = {
      search_runs: [],
      run_reviewer_assignments: [],
      run_reviewer_assignment_revocations: [],
      filter_decisions: [],
      review_requirements: [],
      human_adjudication_events: [],
    }
    mocks.db = createFakeDb(tables)
  })

  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET()).status).toBe(401)
  })

  it('never returns another user\'s runs unless actively assigned', async () => {
    const othersRun = uuid('11111111')
    tables.search_runs.push(run({ id: othersRun, user_id: OTHER }))
    requiredRecord(tables, othersRun)
    // Assigned to someone else, not me.
    tables.run_reviewer_assignments.push(assignment(othersRun, 'cccccccc-dddd-4eee-8fff-000000000000'))

    const { status, body } = await inbox()
    expect(status).toBe(200)
    expect(body.items).toEqual([])
  })

  it('lists an actively assigned run with role, owner flag and open count', async () => {
    const runId = uuid('11111111')
    tables.search_runs.push(run({ id: runId, user_id: OTHER }))
    requiredRecord(tables, runId)
    requiredRecord(tables, runId, { final: true })
    tables.run_reviewer_assignments.push(assignment(runId, ME, 'both'))

    const { body } = await inbox()
    expect(body.items).toEqual([expect.objectContaining({
      run_id: runId, device_name: 'Infusion pump', assignment_role: 'both', is_owner: false,
      open_requirements: 1, required_records: 2, state: 'pending', review_status: 'draft',
      period_from: '2026-07-01', period_to: '2026-09-30',
    })])
  })

  it('excludes revoked assignments', async () => {
    const runId = uuid('11111111')
    tables.search_runs.push(run({ id: runId, user_id: OTHER }))
    requiredRecord(tables, runId)
    const a = assignment(runId, ME)
    tables.run_reviewer_assignments.push(a)
    tables.run_reviewer_assignment_revocations.push({
      id: uuid('66666666'), assignment_id: a.id, revoked_by: OTHER, reason: null, revoked_at: '2026-10-03T00:00:00Z',
    })

    expect((await inbox()).body.items).toEqual([])
  })

  it('excludes deleted and canary runs even when assigned', async () => {
    const deleted = uuid('11111111')
    const canary = uuid('11111111')
    tables.search_runs.push(
      run({ id: deleted, user_id: OTHER, deleted_at: '2026-10-05T00:00:00Z' }),
      run({ id: canary, user_id: OTHER, is_synthetic_canary: true }),
    )
    requiredRecord(tables, deleted)
    requiredRecord(tables, canary)
    tables.run_reviewer_assignments.push(assignment(deleted, ME), assignment(canary, ME))

    expect((await inbox()).body.items).toEqual([])
  })

  it('excludes owned approved runs and owned runs without open records', async () => {
    const approved = uuid('11111111')
    const done = uuid('11111111')
    const open = uuid('11111111')
    tables.search_runs.push(
      run({ id: approved, user_id: ME, review_status: 'approved' }),
      run({ id: done, user_id: ME }),
      run({ id: open, user_id: ME, review_status: 'reviewed' }),
    )
    requiredRecord(tables, approved)
    requiredRecord(tables, done, { final: true })
    requiredRecord(tables, open)

    const { body } = await inbox()
    expect(body.items.map((item: { run_id: string }) => item.run_id)).toEqual([open])
    expect(body.items[0]).toEqual(expect.objectContaining({ is_owner: true, assignment_role: null, state: 'pending' }))
  })

  it('shows an assigned approved run as approved, not pending, with no open count', async () => {
    const runId = uuid('11111111')
    tables.search_runs.push(run({ id: runId, user_id: OTHER, review_status: 'approved' }))
    requiredRecord(tables, runId)
    tables.run_reviewer_assignments.push(assignment(runId, ME))

    const { body } = await inbox()
    expect(body.items).toEqual([expect.objectContaining({ state: 'approved', open_requirements: null })])
  })

  it('marks degraded runs as incomplete coverage and failed runs as failed', async () => {
    const degraded = uuid('11111111')
    const failed = uuid('11111111')
    tables.search_runs.push(
      run({ id: degraded, user_id: OTHER, status: 'degraded' }),
      run({ id: failed, user_id: OTHER, status: 'error', completed_at: null }),
    )
    requiredRecord(tables, degraded)
    tables.run_reviewer_assignments.push(assignment(degraded, ME), assignment(failed, ME))

    const { body } = await inbox()
    const byId = new Map(body.items.map((item: { run_id: string }) => [item.run_id, item]))
    expect(byId.get(degraded)).toEqual(expect.objectContaining({ coverage_incomplete: true, state: 'pending' }))
    expect(byId.get(failed)).toEqual(expect.objectContaining({ state: 'failed', open_requirements: null }))
  })

  it('fails the whole inbox (503) rather than understating pending work', async () => {
    const runId = uuid('11111111')
    tables.search_runs.push(run({ id: runId, user_id: OTHER }))
    tables.run_reviewer_assignments.push(assignment(runId, ME))
    mocks.db.failTables.add('human_adjudication_events')

    expect((await GET()).status).toBe(503)
  })
})

describe('open record counting', () => {
  it('counts across more than one PostgREST page and honours supersession and second review', async () => {
    const runId = '11111111-0000-4000-8000-000000000001'
    const tables: Record<string, Row[]> = {
      filter_decisions: [], review_requirements: [], human_adjudication_events: [],
    }
    // 1,500 AI-excluded records (not required) plus 1,200 AI-relevant (required).
    for (let i = 0; i < 2_700; i += 1) {
      tables.filter_decisions.push({
        id: `d-${i}`, search_run_id: runId, fsn_result_id: `r-${i}`,
        decision: i < 1_500 ? 'excluded' : 'relevant', decided_at: '2026-10-01T00:00:00Z',
      })
    }
    // One sampled exclusion becomes required through an explicit requirement.
    tables.review_requirements.push({ id: 'req-1', search_run_id: runId, fsn_result_id: 'r-0' })
    // r-1500: final then superseded by another final: complete.
    tables.human_adjudication_events.push(
      { id: 'e-1', search_run_id: runId, fsn_result_id: 'r-1500', phase: 'final', disposition: 'relevant', reviewer_id: ME, supersedes_event_id: null, review_of_event_id: null, requires_second_review: false, created_at: '2026-10-02T00:00:00Z' },
      { id: 'e-2', search_run_id: runId, fsn_result_id: 'r-1500', phase: 'final', disposition: 'uncertain', reviewer_id: ME, supersedes_event_id: 'e-1', review_of_event_id: null, requires_second_review: false, created_at: '2026-10-03T00:00:00Z' },
      // r-1501: final requiring second review, none yet: open, second-review pending.
      { id: 'e-3', search_run_id: runId, fsn_result_id: 'r-1501', phase: 'final', disposition: 'excluded', reviewer_id: ME, supersedes_event_id: null, review_of_event_id: null, requires_second_review: true, created_at: '2026-10-02T00:00:00Z' },
      // r-1502: final requiring second review, agreeing review by another person: complete.
      { id: 'e-4', search_run_id: runId, fsn_result_id: 'r-1502', phase: 'final', disposition: 'excluded', reviewer_id: ME, supersedes_event_id: null, review_of_event_id: null, requires_second_review: true, created_at: '2026-10-02T00:00:00Z' },
      { id: 'e-5', search_run_id: runId, fsn_result_id: 'r-1502', phase: 'second_review', disposition: 'excluded', reviewer_id: OTHER, supersedes_event_id: null, review_of_event_id: 'e-4', requires_second_review: false, created_at: '2026-10-03T00:00:00Z' },
    )
    const db = createFakeDb(tables)

    const { data, error } = await countOpenRecords(db as never, runId)

    expect(error).toBeNull()
    expect(data).toEqual({ required_records: 1_201, open_requirements: 1_199, second_review_pending: 1 })
  })
})
