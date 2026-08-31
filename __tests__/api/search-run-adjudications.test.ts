import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  logAuditEvent: vi.fn(),
  tables: {} as Record<string, Record<string, unknown>[]>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}))

function query(table: string) {
  const filters: Array<[string, unknown]> = []
  let inserted: Record<string, unknown> | null = null

  function rows() {
    if (inserted) {
      const row = { id: '99999999-9999-4999-8999-999999999999', created_at: '2026-08-31T10:00:00.000Z', ...inserted }
      mocks.tables[table].push(row)
      inserted = row
      return [row]
    }
    return (mocks.tables[table] ?? []).filter((row) =>
      filters.every(([column, value]) => (row[column] ?? null) === value),
    )
  }

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return chain }),
    is: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return chain }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn((value: Record<string, unknown>) => { inserted = value; return chain }),
    maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn(query) })),
}))

import { GET, POST } from '@/app/api/search-runs/[id]/adjudications/route'

const RUN_ID = '11111111-2222-4333-8444-555555555555'
const RESULT_ID = '22222222-3333-4444-8555-666666666666'
const DECISION_ID = '33333333-4444-4555-8666-777777777777'
const REQUIREMENT_ID = '44444444-5555-4666-8777-888888888888'
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function resetTables() {
  mocks.tables = {
    search_runs: [{
      id: RUN_ID, user_id: USER_ID, review_status: 'draft', is_synthetic_canary: false, deleted_at: null,
    }],
    run_reviewer_assignments: [],
    fsn_results: [{
      id: RESULT_ID, run_id: RUN_ID, title: 'Device field action', manufacturer: 'Acme',
      fsn_date: '2026-08-01', source_url: 'https://example.test/fsn', source_db: 'bfarm', raw_content: 'Corrective action.',
    }],
    filter_decisions: [{
      id: DECISION_ID, search_run_id: RUN_ID, fsn_result_id: RESULT_ID,
      decision: 'excluded', rationale: 'AI-only rationale must stay hidden.', confidence: 0.97,
      model_used: 'hidden-model', prompt_version: 'hidden-prompt', authority_revision_id: null,
      evidence_parser_version: null, decided_at: '2026-08-31T08:00:00.000Z',
    }],
    review_requirements: [{
      id: REQUIREMENT_ID, search_run_id: RUN_ID, fsn_result_id: RESULT_ID,
      filter_decision_id: DECISION_ID, requirement_reason: 'sampled_exclusion',
      blind_review_required: true, source_reference_id: null, created_by: null,
      created_at: '2026-08-31T08:01:00.000Z',
    }],
    human_adjudication_events: [],
  }
}

function post(body: Record<string, unknown>) {
  return POST(new Request(`https://example.test/api/search-runs/${RUN_ID}/adjudications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fsn_result_id: RESULT_ID,
      disposition: 'relevant',
      rationale: 'Documented device-specific evidence supports this disposition.',
      reviewer_role: 'prrc',
      qualification_attestation: 'Appointed PRRC for this device family',
      attests_qualified: true,
      ...body,
    }),
  }), { params: Promise.resolve({ id: RUN_ID }) })
}

describe('record-level adjudication API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTables()
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mocks.logAuditEvent.mockResolvedValue(undefined)
  })

  it('omits every AI field and neutralizes the selection reason before blind review', async () => {
    const response = await GET(new Request('https://example.test'), {
      params: Promise.resolve({ id: RUN_ID }),
    })
    const body = await response.json()
    const record = body.records[0]

    expect(response.status).toBe(200)
    expect(record).not.toHaveProperty('filter_decision')
    expect(record.requirement_reasons).toEqual(['blind_validation'])
    expect(JSON.stringify(record)).not.toContain('hidden-model')
    expect(JSON.stringify(record)).not.toContain('sampled_exclusion')
  })

  it('rejects a final disposition until the viewer locks a blind provisional decision', async () => {
    const response = await post({ phase: 'final' })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('blind provisional'),
    }))
    expect(mocks.tables.human_adjudication_events).toHaveLength(0)
  })

  it('persists the provisional decision as blind and reveals AI only after that append succeeds', async () => {
    const response = await post({ phase: 'provisional_blind', confidence: 4 })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.tables.human_adjudication_events[0]).toEqual(expect.objectContaining({
      phase: 'provisional_blind', blind_to_ai: true, confidence: 4,
    }))
    expect(body.record.filter_decision).toEqual(expect.objectContaining({
      id: DECISION_ID, model_used: 'hidden-model',
    }))
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      USER_ID,
      'adjudication_event_recorded',
      expect.objectContaining({ phase: 'provisional_blind' }),
      expect.any(Request),
    )
  })

  it('server-derives material downgrade and independent-review controls', async () => {
    mocks.tables.human_adjudication_events.push({
      id: '55555555-6666-4777-8888-999999999999', search_run_id: RUN_ID,
      fsn_result_id: RESULT_ID, filter_decision_id: DECISION_ID, reviewer_id: USER_ID,
      phase: 'provisional_blind', disposition: 'relevant', confidence: 5,
      rationale: 'Independent source evidence indicated relevance.', reviewer_role: 'prrc',
      qualification_attestation: 'Appointed PRRC for this device family', attests_qualified: true,
      blind_to_ai: true, provisional_event_id: null, supersedes_event_id: null,
      review_of_event_id: null, requires_second_review: false, material_change: false,
      serious_event_signal: false, ai_model_snapshot: null, ai_prompt_version_snapshot: null,
      authority_revision_id: null, evidence_parser_version_snapshot: null,
      created_at: '2026-08-31T09:00:00.000Z',
    })

    const response = await post({
      phase: 'final', disposition: 'excluded',
      rationale: 'Post-reveal evidence review supports exclusion with documented justification.',
    })

    expect(response.status).toBe(201)
    expect(mocks.tables.human_adjudication_events.at(-1)).toEqual(expect.objectContaining({
      phase: 'final', disposition: 'excluded', material_change: true,
      requires_second_review: true,
      provisional_event_id: '55555555-6666-4777-8888-999999999999',
    }))
  })

  it('does not let ownership substitute for an independent second-review assignment', async () => {
    mocks.tables.human_adjudication_events.push({
      id: '66666666-7777-4888-8999-000000000000', search_run_id: RUN_ID,
      fsn_result_id: RESULT_ID, filter_decision_id: DECISION_ID,
      reviewer_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', phase: 'final',
      disposition: 'excluded', confidence: null, rationale: 'Primary final rationale.',
      reviewer_role: 'regulatory_affairs', qualification_attestation: 'Assigned regulatory reviewer',
      attests_qualified: true, blind_to_ai: false, provisional_event_id: null,
      supersedes_event_id: null, review_of_event_id: null, requires_second_review: true,
      material_change: true, serious_event_signal: false, ai_model_snapshot: 'model',
      ai_prompt_version_snapshot: 'prompt', authority_revision_id: null,
      evidence_parser_version_snapshot: null, created_at: '2026-08-31T09:00:00.000Z',
    })

    const response = await post({ phase: 'second_review', disposition: 'excluded' })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('assignment'),
    }))
  })
})
