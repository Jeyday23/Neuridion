import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, type FakeDb, type Row } from './fake-supabase'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  logAuditEvent: vi.fn(),
  isRunAdjudicationComplete: vi.fn(),
  db: null as unknown as FakeDb,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mocks.db),
}))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}))
vi.mock('@/lib/adjudication/readiness', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/adjudication/readiness')>(),
  isRunAdjudicationComplete: mocks.isRunAdjudicationComplete,
}))

import { PATCH } from '@/app/api/search-runs/[id]/review/route'

const RUN_ID = '11111111-2222-4333-8444-555555555555'
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const REVIEWER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const STRANGER_ID = 'cccccccc-dddd-4eee-8fff-000000000000'
const REVIEWED_AT = '2026-10-05T09:00:00.000Z'

function request(reviewStatus: string): Request {
  return new Request(`https://example.test/api/search-runs/${RUN_ID}/review`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ review_status: reviewStatus }),
  })
}

const ctx = () => ({ params: Promise.resolve({ id: RUN_ID }) })

function seed(run: Partial<Row> = {}, extra: { assignments?: Row[]; revocations?: Row[]; events?: Row[] } = {}) {
  mocks.db = createFakeDb({
    search_runs: [{
      id: RUN_ID, user_id: USER_ID, status: 'complete', completed_at: '2026-10-08T10:00:00Z',
      review_status: 'draft', reviewed_by: null, reviewed_at: null, approved_by: null, approved_at: null,
      is_synthetic_canary: false, deleted_at: null, ...run,
    }],
    run_reviewer_assignments: extra.assignments ?? [],
    run_reviewer_assignment_revocations: extra.revocations ?? [],
    human_adjudication_events: extra.events ?? [],
  })
  return mocks.db.tables.search_runs[0]
}

function as(userId: string) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
}

function assignment(reviewerId: string, role: string, id = '77777777-7777-4777-8777-777777777777'): Row {
  return {
    id, search_run_id: RUN_ID, reviewer_id: reviewerId, assigned_by: USER_ID,
    assignment_role: role, assigned_at: '2026-10-01T00:00:00Z',
  }
}

function finalEvent(reviewerId: string): Row {
  return {
    id: '88888888-8888-4888-8888-888888888888', search_run_id: RUN_ID, fsn_result_id: 'r1',
    reviewer_id: reviewerId, phase: 'final', disposition: 'relevant', created_at: '2026-10-04T00:00:00Z',
  }
}

function auditCall(eventType: string) {
  return mocks.logAuditEvent.mock.calls.find((call) => call[1] === eventType)
}

describe('PRRC review transition API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    as(USER_ID)
    mocks.logAuditEvent.mockResolvedValue(undefined)
    mocks.isRunAdjudicationComplete.mockResolvedValue({ ready: true, error: null })
  })

  it.each(['pending', 'running', 'error'])('blocks review and approval for %s runs even if RPC returns true', async (status) => {
    for (const [review_status, target] of [['draft', 'reviewed'], ['reviewed', 'approved']]) {
      seed({ review_status, status, reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })
      const response = await PATCH(request(target), ctx())
      expect(response.status).toBe(422)
      expect(mocks.db.updates).toHaveLength(0)
    }
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('blocks completed runs missing a completion timestamp', async () => {
    seed({ review_status: 'reviewed', completed_at: null, reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })
    expect((await PATCH(request('approved'), ctx())).status).toBe(422)
  })

  it('rejects approval directly from draft', async () => {
    seed({ review_status: 'draft' })

    const response = await PATCH(request('approved'), ctx())

    expect(response.status).toBe(422)
    expect(mocks.db.updates).toHaveLength(0)
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('moves draft to reviewed with reviewer attribution and leaves approval empty', async () => {
    const row = seed({ review_status: 'draft' })

    const response = await PATCH(request('reviewed'), ctx())

    expect(response.status).toBe(200)
    expect(mocks.db.updates[0].patch).toEqual({
      review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: expect.any(String),
    })
    expect(row).toEqual(expect.objectContaining({ review_status: 'reviewed', reviewed_by: USER_ID, approved_by: null }))
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1)
  })

  it('sets approved_by/approved_at and preserves reviewed_by/reviewed_at on approval', async () => {
    const row = seed(
      { review_status: 'reviewed', reviewed_by: REVIEWER_ID, reviewed_at: REVIEWED_AT },
      { assignments: [assignment(REVIEWER_ID, 'primary')], events: [finalEvent(REVIEWER_ID)] },
    )

    const response = await PATCH(request('approved'), ctx())
    const body = await response.json()

    expect(response.status).toBe(200)
    const patch = mocks.db.updates[0].patch
    expect(patch).toEqual({ review_status: 'approved', approved_by: USER_ID, approved_at: expect.any(String) })
    expect(patch).not.toHaveProperty('reviewed_by')
    expect(patch).not.toHaveProperty('reviewed_at')
    expect(row).toEqual(expect.objectContaining({
      review_status: 'approved', reviewed_by: REVIEWER_ID, reviewed_at: REVIEWED_AT, approved_by: USER_ID,
    }))
    expect(body).toEqual(expect.objectContaining({
      reviewed_by: REVIEWER_ID, reviewed_at: REVIEWED_AT, approved_by: USER_ID, self_approval: false,
    }))
    expect(auditCall('self_approval_override')).toBeUndefined()
    expect(auditCall('prrc_review_completed')?.[2]).toEqual(expect.objectContaining({
      review_status: 'approved', reviewed_by: REVIEWER_ID, approved_by: USER_ID,
      self_approval: false, self_approval_basis: [],
    }))
  })

  it('records self-approval when the approver is the recorded reviewer (single-user justification)', async () => {
    seed({ review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })

    const response = await PATCH(request('approved'), ctx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.self_approval).toBe(true)
    expect(auditCall('prrc_review_completed')?.[2]).toEqual(expect.objectContaining({
      self_approval: true, self_approval_basis: ['approver_is_recorded_reviewer'],
    }))
    expect(auditCall('self_approval_override')?.[2]).toEqual(expect.objectContaining({
      run_id: RUN_ID,
      active_reviewer_assignments: 0,
      justification: expect.stringContaining('Single-user organisation'),
    }))
  })

  it('records self-approval when the approver recorded a final disposition, without claiming single-user', async () => {
    seed(
      { review_status: 'reviewed', reviewed_by: REVIEWER_ID, reviewed_at: REVIEWED_AT },
      { assignments: [assignment(REVIEWER_ID, 'primary')], events: [finalEvent(USER_ID)] },
    )

    const body = await (await PATCH(request('approved'), ctx())).json()

    expect(body.self_approval).toBe(true)
    const override = auditCall('self_approval_override')?.[2]
    expect(override).toEqual(expect.objectContaining({
      self_approval_basis: ['approver_recorded_final_disposition'],
      active_reviewer_assignments: 1,
    }))
    expect(override.justification).not.toContain('Single-user')
  })

  it('does not count a revoked assignment as an independent reviewer', async () => {
    seed(
      { review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: REVIEWED_AT },
      {
        assignments: [assignment(REVIEWER_ID, 'primary')],
        revocations: [{ id: 'rv1', assignment_id: '77777777-7777-4777-8777-777777777777', revoked_by: USER_ID }],
      },
    )

    await PATCH(request('approved'), ctx())

    expect(auditCall('self_approval_override')?.[2]).toEqual(expect.objectContaining({
      active_reviewer_assignments: 0,
      justification: expect.stringContaining('Single-user organisation'),
    }))
  })

  it('refuses approval when no reviewer attribution is recorded', async () => {
    seed({ review_status: 'reviewed', reviewed_by: null, reviewed_at: null })
    const response = await PATCH(request('approved'), ctx())
    expect(response.status).toBe(422)
    expect(mocks.db.updates).toHaveLength(0)
  })

  it('fails closed when independence cannot be verified', async () => {
    seed({ review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })
    mocks.db.failTables.add('human_adjudication_events')
    expect((await PATCH(request('approved'), ctx())).status).toBe(503)
    expect(mocks.db.updates).toHaveLength(0)
  })

  it('blocks run approval while required record-level adjudication is incomplete', async () => {
    seed({ review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })
    mocks.isRunAdjudicationComplete.mockResolvedValue({ ready: false, error: null })

    const response = await PATCH(request('approved'), ctx())

    expect(response.status).toBe(422)
    expect(mocks.db.updates).toHaveLength(0)
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('surfaces the DB readiness trigger as 409', async () => {
    seed({ review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })
    mocks.db.beforeUpdate = () => ({ code: '23514', message: 'Search run has unresolved record-level adjudications' })
    const response = await PATCH(request('approved'), ctx())
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Refresh')
  })

  it('uses a null-safe compare-and-set for legacy draft rows', async () => {
    const row = seed({ review_status: null })

    const response = await PATCH(request('reviewed'), ctx())

    expect(response.status).toBe(200)
    expect(row.review_status).toBe('reviewed')
  })

  it('rejects a stale concurrent transition instead of overwriting it', async () => {
    const row = seed({ review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: REVIEWED_AT })
    mocks.db.beforeUpdate = () => { row.review_status = 'draft' }

    const response = await PATCH(request('approved'), ctx())

    expect(response.status).toBe(409)
    expect(row.review_status).toBe('draft')
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('does not reveal another user\'s run', async () => {
    seed()
    as(STRANGER_ID)

    const response = await PATCH(request('reviewed'), ctx())

    expect(response.status).toBe(404)
    expect(mocks.db.updates).toHaveLength(0)
  })

  describe('assigned reviewers', () => {
    it('lets an active primary reviewer mark the run reviewed, attributed to them', async () => {
      const row = seed({}, { assignments: [assignment(REVIEWER_ID, 'primary')] })
      as(REVIEWER_ID)

      const response = await PATCH(request('reviewed'), ctx())

      expect(response.status).toBe(200)
      expect(row).toEqual(expect.objectContaining({ review_status: 'reviewed', reviewed_by: REVIEWER_ID }))
      expect(auditCall('prrc_review_completed')?.[2]).toEqual(expect.objectContaining({ actor_is_owner: false }))
    })

    it('never lets an assigned reviewer approve', async () => {
      seed(
        { review_status: 'reviewed', reviewed_by: REVIEWER_ID, reviewed_at: REVIEWED_AT },
        { assignments: [assignment(REVIEWER_ID, 'both')] },
      )
      as(REVIEWER_ID)

      const response = await PATCH(request('approved'), ctx())

      expect(response.status).toBe(403)
      expect((await response.json()).error).toContain('owner')
      expect(mocks.db.updates).toHaveLength(0)
    })

    it('does not let a second-review-only assignment mark the run reviewed', async () => {
      seed({}, { assignments: [assignment(REVIEWER_ID, 'secondary')] })
      as(REVIEWER_ID)
      expect((await PATCH(request('reviewed'), ctx())).status).toBe(403)
      expect(mocks.db.updates).toHaveLength(0)
    })

    it('treats a revoked reviewer as a stranger (404)', async () => {
      seed({}, {
        assignments: [assignment(REVIEWER_ID, 'primary')],
        revocations: [{ id: 'rv1', assignment_id: '77777777-7777-4777-8777-777777777777', revoked_by: USER_ID }],
      })
      as(REVIEWER_ID)
      expect((await PATCH(request('reviewed'), ctx())).status).toBe(404)
      expect(mocks.db.updates).toHaveLength(0)
    })
  })
})
