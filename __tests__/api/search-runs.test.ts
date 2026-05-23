import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUser = { id: 'aaaa-bbbb-cccc-dddd', email: 'test@example.com' }

function chainable(terminal: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {}
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'gte', 'lte', 'lt', 'rpc']
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
  createAdminClient: vi.fn(() => {
    const chain = mockAdminChain
    return {
      from: vi.fn().mockReturnValue(chain),
      rpc: vi.fn().mockResolvedValue({ data: 'mock-run-id', error: null }),
    }
  }),
}))

// Rate limit: always allow by default
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}))

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}))

// Mock QStash (route imports it)
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: vi.fn().mockResolvedValue({}),
  })),
}))

// Ensure QSTASH_TOKEN and NEXT_PUBLIC_SITE_URL are set for the success path
vi.stubEnv('QSTASH_TOKEN', 'test-token')
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

// ---------------------------------------------------------------------------
// Import route handler (after mocks)
// ---------------------------------------------------------------------------
import { POST } from '@/app/api/search-runs/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/search-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: '11111111-2222-4333-8444-555555555555',
    period_from: '2025-01-01',
    period_to: '2025-06-01',
    selected_dbs: ['bfarm'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/search-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSupabaseChain = chainable({
      single: vi.fn().mockResolvedValue({ data: { plan: 'pro', processing_restricted: false }, error: null }),
    })
    mockAdminChain = chainable()
    ;(mockAdminChain['select'] as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminChain)
    ;(mockAdminChain['eq'] as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminChain)
    // First .in() chains to .lt() for stale cleanup; second .in() is terminal for count query
    ;(mockAdminChain['in'] as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(mockAdminChain)
      .mockResolvedValue({ count: 0, error: null })
    ;(mockAdminChain['lt'] as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null })
    ;(mockAdminChain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'job-1' }, error: null })
  })

  // --- Auth ---
  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const res = await POST(jsonRequest(validBody()))
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  // --- JSON parsing ---
  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/search-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  // --- Missing required fields ---
  it('returns 400 when profile_id is missing', async () => {
    const res = await POST(jsonRequest({
      period_from: '2025-01-01',
      period_to: '2025-06-01',
      selected_dbs: ['bfarm'],
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when period_from is missing', async () => {
    const res = await POST(jsonRequest({
      profile_id: '11111111-2222-4333-8444-555555555555',
      period_to: '2025-06-01',
      selected_dbs: ['bfarm'],
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when period_to is missing', async () => {
    const res = await POST(jsonRequest({
      profile_id: '11111111-2222-4333-8444-555555555555',
      period_from: '2025-01-01',
      selected_dbs: ['bfarm'],
    }))
    expect(res.status).toBe(400)
  })

  // --- Field validation ---
  it('returns 400 when profile_id is not a valid UUID', async () => {
    const res = await POST(jsonRequest(validBody({ profile_id: 'not-a-uuid' })))
    expect(res.status).toBe(400)
  })

  it('returns 400 when period_from is not YYYY-MM-DD format', async () => {
    const res = await POST(jsonRequest(validBody({ period_from: '01-01-2025' })))
    expect(res.status).toBe(400)
  })

  it('returns 400 when period_to is not YYYY-MM-DD format', async () => {
    const res = await POST(jsonRequest(validBody({ period_to: 'June 2025' })))
    expect(res.status).toBe(400)
  })

  it('returns 400 when period_from is after period_to', async () => {
    const res = await POST(jsonRequest(validBody({
      period_from: '2025-12-01',
      period_to: '2025-01-01',
    })))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Validation failed. Check your input and try again.')
  })

  it('returns 400 when date range exceeds 5 years', async () => {
    const res = await POST(jsonRequest(validBody({
      period_from: '2018-01-01',
      period_to: '2025-06-01',
    })))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Validation failed. Check your input and try again.')
  })

  it('returns 400 when selected_dbs contains unknown source', async () => {
    const res = await POST(jsonRequest(validBody({ selected_dbs: ['bfarm', 'unknown_db'] })))
    expect(res.status).toBe(400)
  })

  it('returns 400 when selected_dbs is an empty array', async () => {
    const res = await POST(jsonRequest(validBody({ selected_dbs: [] })))
    expect(res.status).toBe(400)
  })

  // --- Rate limiting ---
  it('returns 429 when rate limited', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    ;(rateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: false, retryAfterMs: 30000 })

    const res = await POST(jsonRequest(validBody()))
    expect(res.status).toBe(429)

    const json = await res.json()
    expect(json.error).toBe('Too many requests')
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  // --- Accepts valid body without validation error ---
  it('does not return 400 for a valid, complete body', async () => {
    const res = await POST(jsonRequest(validBody()))
    // Should pass validation (status will depend on downstream mocks — but NOT 400)
    expect(res.status).not.toBe(400)
  })

  it('accepts all four known database sources', async () => {
    const res = await POST(jsonRequest(validBody({
      selected_dbs: ['bfarm', 'mhra', 'fda', 'swissmedic'],
    })))
    expect(res.status).not.toBe(400)
  })

  it('selected_dbs is optional (defaults handled downstream)', async () => {
    const body = validBody()
    delete (body as Record<string, unknown>)['selected_dbs']
    const res = await POST(jsonRequest(body))
    // Should not fail validation
    expect(res.status).not.toBe(400)
  })
})
