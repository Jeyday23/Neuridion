import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const VALID_UUID = '11111111-2222-4333-8444-555555555555'
const mockUser = { id: 'aaaa-bbbb-cccc-dddd', email: 'test@example.com' }

function chainable(terminal: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {}
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'gte', 'lte']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder['single'] = vi.fn().mockResolvedValue({ data: null, error: null, ...terminal })
  Object.assign(builder, terminal)
  return builder
}

let mockGetUser: ReturnType<typeof vi.fn>
let mockSupabaseChain: ReturnType<typeof chainable>
let mockAdminChain: ReturnType<typeof chainable>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn().mockReturnValue(mockSupabaseChain),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue(mockAdminChain),
  })),
}))

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import route handlers (after mocks)
// ---------------------------------------------------------------------------
import { GET, DELETE } from '@/app/api/search-runs/[id]/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function dummyRequest(method = 'GET'): Request {
  return new Request(`http://localhost/api/search-runs/${VALID_UUID}`, { method })
}

// ---------------------------------------------------------------------------
// Tests: GET /api/search-runs/[id]
// ---------------------------------------------------------------------------
describe('GET /api/search-runs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSupabaseChain = chainable()
    mockAdminChain = chainable()
  })

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await GET(dummyRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid ID')
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const res = await GET(dummyRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when run does not exist', async () => {
    // The search_runs query returns no data
    mockSupabaseChain = chainable({
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    })

    const res = await GET(dummyRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toBe('Not found')
  })

  it('returns 404 when run belongs to a different user', async () => {
    // Run exists but user_id doesn't match the authenticated user
    mockSupabaseChain = chainable({
      single: vi.fn().mockResolvedValue({
        data: { id: VALID_UUID, user_id: 'different-user-id', status: 'complete' },
        error: null,
      }),
    })

    const res = await GET(dummyRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toBe('Not found')
  })

  it('returns run data with enriched results on success', async () => {
    const runData = {
      id: VALID_UUID,
      user_id: mockUser.id,
      status: 'complete',
      relevant_count: 2,
      uncertain_count: 1,
      excluded_count: 5,
    }
    mockSupabaseChain = chainable({
      single: vi.fn().mockResolvedValue({ data: runData, error: null }),
    })

    // Admin client returns fsn_results and filter_decisions
    const results = [
      { id: 'r1', title: 'FSN-1', manufacturer: 'Acme', fsn_date: '2025-03-01', source_url: 'https://example.com', source_db: 'bfarm' },
    ]
    const decisions = [
      { fsn_result_id: 'r1', decision: 'relevant', rationale: 'Matches device', confidence: 0.95, model_used: 'claude-sonnet-4-5' },
    ]

    // We need the admin from() to return different chains for fsn_results and filter_decisions
    const fsnChain = chainable()
    ;(fsnChain['order'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: results, error: null })

    const decisionChain = chainable()
    ;(decisionChain['eq'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: decisions, error: null })

    const adminFromCallCount = 0
    mockAdminChain = chainable() // fallback
    vi.mocked((await import('@/lib/supabase/admin')).createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fsn_results') return fsnChain
        if (table === 'filter_decisions') return decisionChain
        return mockAdminChain
      }),
    } as never)

    const res = await GET(dummyRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe('complete')
    expect(json.relevant_count).toBe(2)
    expect(json.results).toHaveLength(1)
    expect(json.results[0].filter_decision).toBeDefined()
    expect(json.results[0].filter_decision.decision).toBe('relevant')
  })
})

// ---------------------------------------------------------------------------
// Tests: DELETE /api/search-runs/[id]
// ---------------------------------------------------------------------------
describe('DELETE /api/search-runs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSupabaseChain = chainable()
    mockAdminChain = chainable()
  })

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await DELETE(dummyRequest('DELETE'), makeParams('bad-id'))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid ID')
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const res = await DELETE(dummyRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when run does not exist or belongs to different user', async () => {
    // Admin client query for run returns nothing
    mockAdminChain = chainable({
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    })

    const res = await DELETE(dummyRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toBe('Not found')
  })

  it('returns success when run is deleted', async () => {
    // The admin from() call sequence:
    // 1. select run by id+user_id (with .is('deleted_at', null)) → found
    // 2. soft-delete update → success
    let callIdx = 0
    const adminFrom = vi.fn().mockImplementation(() => {
      callIdx++
      if (callIdx === 1) {
        const c = chainable({
          single: vi.fn().mockResolvedValue({ data: { id: VALID_UUID, user_id: mockUser.id }, error: null }),
        })
        return c
      }
      // soft-delete update: .update().eq('id').eq('user_id') — second .eq() is terminal
      const c = chainable()
      ;(c['eq'] as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(c)
        .mockResolvedValue({ error: null })
      return c
    })

    vi.mocked((await import('@/lib/supabase/admin')).createAdminClient).mockReturnValue({
      from: adminFrom,
    } as never)

    const res = await DELETE(dummyRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.deleted).toBe(true)
  })
})
