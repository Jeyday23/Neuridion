import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminFrom: vi.fn(),
  logAuditEvent: vi.fn(),
  isRunAdjudicationComplete: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.adminFrom })),
}))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}))
vi.mock('@/lib/adjudication/readiness', () => ({
  isRunAdjudicationComplete: mocks.isRunAdjudicationComplete,
}))

import { PATCH } from '@/app/api/search-runs/[id]/review/route'

const RUN_ID = '11111111-2222-4333-8444-555555555555'
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function request(reviewStatus: string): Request {
  return new Request(`https://example.test/api/search-runs/${RUN_ID}/review`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ review_status: reviewStatus }),
  })
}

function existingQuery(data: { review_status: string | null } | null) {
  const chain = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), single: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.single.mockResolvedValue({
    data: data ? { id: RUN_ID, user_id: USER_ID, ...data } : null,
    error: data ? null : { code: 'PGRST116' },
  })
  return chain
}

function updateQuery(data: Record<string, unknown> | null, error: Record<string, unknown> | null = null) {
  const chain = {
    update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
  }
  chain.update.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.maybeSingle.mockResolvedValue({ data, error })
  return chain
}

describe('PRRC review transition API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mocks.logAuditEvent.mockResolvedValue(undefined)
    mocks.isRunAdjudicationComplete.mockResolvedValue({ ready: true, error: null })
  })

  it('rejects approval directly from draft', async () => {
    mocks.adminFrom.mockReturnValueOnce(existingQuery({ review_status: 'draft' }))

    const response = await PATCH(request('approved'), { params: Promise.resolve({ id: RUN_ID }) })

    expect(response.status).toBe(422)
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1)
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('moves draft to reviewed with reviewer attribution', async () => {
    const existing = existingQuery({ review_status: 'draft' })
    const updated = updateQuery({
      id: RUN_ID,
      review_status: 'reviewed',
      reviewed_by: USER_ID,
      reviewed_at: '2026-06-22T10:00:00.000Z',
    })
    mocks.adminFrom.mockReturnValueOnce(existing).mockReturnValueOnce(updated)

    const response = await PATCH(request('reviewed'), { params: Promise.resolve({ id: RUN_ID }) })

    expect(response.status).toBe(200)
    expect(updated.update).toHaveBeenCalledWith(expect.objectContaining({
      review_status: 'reviewed', reviewed_by: USER_ID,
    }))
    expect(updated.eq).toHaveBeenCalledWith('review_status', 'draft')
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1)
  })

  it('moves reviewed to approved and records the self-approval audit', async () => {
    const updated = updateQuery({
      id: RUN_ID,
      review_status: 'approved',
      reviewed_by: USER_ID,
      reviewed_at: '2026-06-22T10:00:00.000Z',
    })
    mocks.adminFrom
      .mockReturnValueOnce(existingQuery({ review_status: 'reviewed' }))
      .mockReturnValueOnce(updated)

    const response = await PATCH(request('approved'), { params: Promise.resolve({ id: RUN_ID }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.self_approval).toBe(true)
    expect(mocks.logAuditEvent).toHaveBeenNthCalledWith(
      1, USER_ID, 'prrc_review_completed', expect.objectContaining({ review_status: 'approved' }), expect.any(Request),
    )
    expect(mocks.logAuditEvent).toHaveBeenNthCalledWith(
      2, USER_ID, 'self_approval_override', expect.objectContaining({ run_id: RUN_ID }), expect.any(Request),
    )
  })

  it('blocks run approval while required record-level adjudication is incomplete', async () => {
    mocks.adminFrom.mockReturnValueOnce(existingQuery({ review_status: 'reviewed' }))
    mocks.isRunAdjudicationComplete.mockResolvedValue({ ready: false, error: null })

    const response = await PATCH(request('approved'), { params: Promise.resolve({ id: RUN_ID }) })

    expect(response.status).toBe(422)
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1)
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('uses a null-safe compare-and-set for legacy draft rows', async () => {
    const updated = updateQuery({
      id: RUN_ID, review_status: 'reviewed', reviewed_by: USER_ID, reviewed_at: '2026-06-22T10:00:00.000Z',
    })
    mocks.adminFrom
      .mockReturnValueOnce(existingQuery({ review_status: null }))
      .mockReturnValueOnce(updated)

    const response = await PATCH(request('reviewed'), { params: Promise.resolve({ id: RUN_ID }) })

    expect(response.status).toBe(200)
    expect(updated.is).toHaveBeenCalledWith('review_status', null)
  })

  it('rejects a stale concurrent transition instead of overwriting it', async () => {
    mocks.adminFrom
      .mockReturnValueOnce(existingQuery({ review_status: 'reviewed' }))
      .mockReturnValueOnce(updateQuery(null))

    const response = await PATCH(request('approved'), { params: Promise.resolve({ id: RUN_ID }) })

    expect(response.status).toBe(409)
    expect(mocks.logAuditEvent).not.toHaveBeenCalled()
  })

  it('does not reveal another user\'s run', async () => {
    mocks.adminFrom.mockReturnValueOnce(existingQuery(null))

    const response = await PATCH(request('reviewed'), { params: Promise.resolve({ id: RUN_ID }) })

    expect(response.status).toBe(404)
  })
})
