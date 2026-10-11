import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, type FakeDb } from './fake-supabase'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  logAuditEvent: vi.fn(),
  rateLimit: vi.fn(),
  db: null as unknown as FakeDb,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mocks.db),
}))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))

import { DELETE, GET, POST } from '@/app/api/search-runs/[id]/reviewers/route'
import { GET as GET_ADJUDICATIONS, POST as POST_ADJUDICATION } from '@/app/api/search-runs/[id]/adjudications/route'

const RUN_ID = '11111111-2222-4333-8444-555555555555'
const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const REVIEWER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const STRANGER_ID = 'cccccccc-dddd-4eee-8fff-000000000000'
const RESULT_ID = '22222222-3333-4444-8555-666666666666'
const DECISION_ID = '33333333-4444-4555-8666-777777777777'

function seed(overrides: Record<string, unknown> = {}) {
  mocks.db = createFakeDb({
    search_runs: [{
      id: RUN_ID, user_id: OWNER_ID, review_status: 'draft', status: 'complete',
      is_synthetic_canary: false, deleted_at: null, ...overrides,
    }],
    users: [
      { id: OWNER_ID, email: 'owner@example.test', full_name: 'Olivia Owner', deleted_at: null },
      { id: REVIEWER_ID, email: 'Rev_One@Example.test', full_name: 'Rita Reviewer', deleted_at: null },
      { id: STRANGER_ID, email: 'gone@example.test', full_name: 'Deleted Person', deleted_at: '2026-09-01T00:00:00Z' },
    ],
    run_reviewer_assignments: [],
    run_reviewer_assignment_revocations: [],
    fsn_results: [{
      id: RESULT_ID, run_id: RUN_ID, title: 'Field action', manufacturer: 'Acme',
      fsn_date: '2026-08-01', source_url: 'https://example.test/fsn', source_db: 'bfarm', raw_content: 'Corrective action.',
    }],
    filter_decisions: [{
      id: DECISION_ID, search_run_id: RUN_ID, fsn_result_id: RESULT_ID, decision: 'relevant',
      rationale: 'AI rationale', confidence: 0.9, model_used: 'model', prompt_version: 'p1',
      authority_revision_id: null, evidence_parser_version: null, decided_at: '2026-08-31T08:00:00.000Z',
    }],
    review_requirements: [],
    human_adjudication_events: [],
  }, {
    run_reviewer_assignments: [['search_run_id', 'reviewer_id']],
    run_reviewer_assignment_revocations: [['assignment_id']],
  })
}

function as(userId: string) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId, email: `${userId}@example.test` } }, error: null })
}

const ctx = { params: Promise.resolve({ id: RUN_ID }) }

function assign(body: Record<string, unknown>) {
  return POST(new Request(`https://example.test/api/search-runs/${RUN_ID}/reviewers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: RUN_ID }) })
}

function revoke(assignmentId: string, body?: Record<string, unknown>) {
  return DELETE(new Request(
    `https://example.test/api/search-runs/${RUN_ID}/reviewers?assignment_id=${assignmentId}`,
    { method: 'DELETE', ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) },
  ), { params: Promise.resolve({ id: RUN_ID }) })
}

describe('reviewer assignment API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seed()
    as(OWNER_ID)
    mocks.logAuditEvent.mockResolvedValue(undefined)
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 })
  })

  it('assigns a reviewer by case-insensitive email and audits ids only', async () => {
    const response = await assign({ email: '  rev_one@EXAMPLE.test ', assignment_role: 'primary' })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.assignment).toEqual(expect.objectContaining({
      reviewer_id: REVIEWER_ID, reviewer_name: 'Rita Reviewer', assignment_role: 'primary',
    }))
    expect(mocks.db.tables.run_reviewer_assignments).toHaveLength(1)
    expect(mocks.db.tables.run_reviewer_assignments[0]).toEqual(expect.objectContaining({
      search_run_id: RUN_ID, reviewer_id: REVIEWER_ID, assigned_by: OWNER_ID,
    }))
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      OWNER_ID, 'review_assignment_created',
      { run_id: RUN_ID, assignment_id: body.assignment.id, reviewer_id: REVIEWER_ID, assignment_role: 'primary' },
      expect.any(Request),
    )
    expect(JSON.stringify(mocks.logAuditEvent.mock.calls)).not.toContain('example.test')
  })

  it('does not treat LIKE wildcards in the email as patterns', async () => {
    // '_' is valid in an email and is a single-character LIKE wildcard.
    mocks.db.tables.users.push({ id: 'dddddddd-eeee-4fff-8000-111111111111', email: 'revXone@example.test', full_name: null, deleted_at: null })
    mocks.db.tables.users = mocks.db.tables.users.filter((user) => user.id !== REVIEWER_ID)
    const response = await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })
    expect(response.status).toBe(404)
    expect(mocks.db.tables.run_reviewer_assignments).toHaveLength(0)
  })

  it('returns 404 to a non-owner without revealing the run', async () => {
    as(STRANGER_ID)
    for (const response of [
      await assign({ email: 'rev_one@example.test', assignment_role: 'primary' }),
      await GET(new Request('https://example.test'), ctx),
      await revoke('99999999-9999-4999-8999-999999999999'),
    ]) {
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'Not found' })
    }
    expect(mocks.db.tables.run_reviewer_assignments).toHaveLength(0)
  })

  it('does not let an assigned reviewer manage reviewers', async () => {
    await assign({ email: 'rev_one@example.test', assignment_role: 'both' })
    as(REVIEWER_ID)
    expect((await GET(new Request('https://example.test'), ctx)).status).toBe(404)
    expect((await assign({ email: 'owner@example.test', assignment_role: 'primary' })).status).toBe(404)
  })

  it('rejects assignment and revocation on approved runs with 409', async () => {
    seed({ review_status: 'approved' })
    expect((await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })).status).toBe(409)
    mocks.db.tables.run_reviewer_assignments.push({
      id: '77777777-7777-4777-8777-777777777777', search_run_id: RUN_ID, reviewer_id: REVIEWER_ID,
      assigned_by: OWNER_ID, assignment_role: 'primary', assigned_at: '2026-10-01T00:00:00Z',
    })
    expect((await revoke('77777777-7777-4777-8777-777777777777')).status).toBe(409)
    expect(mocks.db.tables.run_reviewer_assignment_revocations).toHaveLength(0)
  })

  it('rejects self-assignment by the owner with 400', async () => {
    const response = await assign({ email: 'OWNER@example.test', assignment_role: 'both' })
    expect(response.status).toBe(400)
    expect(mocks.db.tables.run_reviewer_assignments).toHaveLength(0)
  })

  it('returns the generic 404 for an unknown or deleted account', async () => {
    for (const email of ['nobody@example.test', 'gone@example.test']) {
      const response = await assign({ email, assignment_role: 'primary' })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'No Neuridion account matches that email.' })
    }
  })

  it('rejects unknown body fields and invalid roles (strict schema)', async () => {
    expect((await assign({ email: 'rev_one@example.test', assignment_role: 'primary', reviewer_id: STRANGER_ID })).status).toBe(422)
    expect((await assign({ email: 'rev_one@example.test', assignment_role: 'owner' })).status).toBe(422)
    expect((await assign({ email: 'not-an-email', assignment_role: 'primary' })).status).toBe(422)
  })

  it('rate-limits assignment', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfterMs: 5_000 })
    const response = await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('5')
  })

  it('returns 409 when the reviewer is already active', async () => {
    expect((await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })).status).toBe(201)
    const again = await assign({ email: 'rev_one@example.test', assignment_role: 'secondary' })
    expect(again.status).toBe(409)
    expect((await again.json()).error).toContain('already an active reviewer')
  })

  it('revokes with an append-only row and audit, then hides the assignment and blocks re-assignment', async () => {
    const created = await (await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })).json()
    const assignmentId = created.assignment.id as string

    const response = await revoke(assignmentId, { reason: 'Left the company' })
    expect(response.status).toBe(200)
    expect(mocks.db.tables.run_reviewer_assignments).toHaveLength(1)
    expect(mocks.db.tables.run_reviewer_assignment_revocations).toEqual([
      expect.objectContaining({ assignment_id: assignmentId, revoked_by: OWNER_ID, reason: 'Left the company' }),
    ])
    expect(mocks.logAuditEvent).toHaveBeenLastCalledWith(
      OWNER_ID, 'review_assignment_revoked',
      expect.objectContaining({ run_id: RUN_ID, assignment_id: assignmentId, reviewer_id: REVIEWER_ID, reason_provided: true }),
      expect.any(Request),
    )

    const list = await (await GET(new Request('https://example.test'), ctx)).json()
    expect(list.assignments).toEqual([])

    expect((await revoke(assignmentId)).status).toBe(409)

    const reassign = await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })
    expect(reassign.status).toBe(409)
    expect((await reassign.json()).error).toContain('cannot be re-assigned')
  })

  it('does not revoke an assignment that belongs to another run', async () => {
    mocks.db.tables.run_reviewer_assignments.push({
      id: '88888888-8888-4888-8888-888888888888', search_run_id: '99999999-9999-4999-8999-999999999999',
      reviewer_id: REVIEWER_ID, assigned_by: STRANGER_ID, assignment_role: 'primary', assigned_at: '2026-10-01T00:00:00Z',
    })
    expect((await revoke('88888888-8888-4888-8888-888888888888')).status).toBe(404)
    expect(mocks.db.tables.run_reviewer_assignment_revocations).toHaveLength(0)
  })

  it('lists active assignments with display names for the owner', async () => {
    await assign({ email: 'rev_one@example.test', assignment_role: 'both' })
    const body = await (await GET(new Request('https://example.test'), ctx)).json()
    expect(body.assignments).toEqual([expect.objectContaining({
      reviewer_id: REVIEWER_ID, reviewer_name: 'Rita Reviewer', reviewer_email: 'Rev_One@Example.test',
      assignment_role: 'both', assigned_by: OWNER_ID, assigned_by_name: 'Olivia Owner',
    })])
  })
})

describe('adjudication access honours revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seed()
    mocks.logAuditEvent.mockResolvedValue(undefined)
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 })
  })

  function adjudicate() {
    return POST_ADJUDICATION(new Request(`https://example.test/api/search-runs/${RUN_ID}/adjudications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fsn_result_id: RESULT_ID, phase: 'final', disposition: 'relevant',
        rationale: 'Documented device-specific evidence supports this.',
        reviewer_role: 'prrc', qualification_attestation: 'Appointed PRRC for this family',
        attests_qualified: true,
      }),
    }), { params: Promise.resolve({ id: RUN_ID }) })
  }

  it('an active reviewer can read and adjudicate; a revoked reviewer gets 404', async () => {
    as(OWNER_ID)
    const created = await (await assign({ email: 'rev_one@example.test', assignment_role: 'primary' })).json()

    as(REVIEWER_ID)
    const read = await GET_ADJUDICATIONS(new Request('https://example.test'), ctx)
    expect(read.status).toBe(200)
    expect((await read.json()).permissions).toEqual(expect.objectContaining({
      is_owner: false, assignment_role: 'primary', can_primary_review: true,
    }))
    expect((await adjudicate()).status).toBe(201)

    as(OWNER_ID)
    expect((await revoke(created.assignment.id)).status).toBe(200)

    as(REVIEWER_ID)
    expect((await GET_ADJUDICATIONS(new Request('https://example.test'), ctx)).status).toBe(404)
    const eventsBefore = mocks.db.tables.human_adjudication_events.length
    expect((await adjudicate()).status).toBe(404)
    expect(mocks.db.tables.human_adjudication_events).toHaveLength(eventsBefore)
  })

  it('fails closed with 503 when revocations cannot be read', async () => {
    mocks.db.tables.run_reviewer_assignments.push({
      id: '77777777-7777-4777-8777-777777777777', search_run_id: RUN_ID, reviewer_id: REVIEWER_ID,
      assigned_by: OWNER_ID, assignment_role: 'primary', assigned_at: '2026-10-01T00:00:00Z',
    })
    mocks.db.failTables.add('run_reviewer_assignment_revocations')
    as(REVIEWER_ID)
    expect((await GET_ADJUDICATIONS(new Request('https://example.test'), ctx)).status).toBe(503)
  })

  it('keeps owner access without any assignment', async () => {
    as(OWNER_ID)
    const read = await GET_ADJUDICATIONS(new Request('https://example.test'), ctx)
    expect(read.status).toBe(200)
    expect((await read.json()).permissions.is_owner).toBe(true)
  })
})
