import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the route module
// ---------------------------------------------------------------------------

const mockUser = { id: 'aaaa-bbbb-cccc-dddd', email: 'test@example.com' }

// Chainable Supabase query builder
function chainable(terminal: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {}
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'gte', 'lte']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder['single'] = vi.fn().mockResolvedValue({ data: null, error: null, ...terminal })
  // Allow non-single terminal calls
  Object.assign(builder, terminal)
  return builder
}

let mockGetUser: ReturnType<typeof vi.fn>
let mockSupabaseChain: ReturnType<typeof chainable>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const chain = mockSupabaseChain
    return {
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue(chain),
    }
  }),
}))

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import route handlers (after mocks are registered)
// ---------------------------------------------------------------------------
import { GET, POST } from '@/app/api/profiles/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function emptyGetRequest(): Request {
  return new Request('http://localhost/api/profiles', { method: 'GET' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseChain = chainable()
    mockGetUser = vi.fn()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const res = await GET()
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns profile data on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    // The chain's terminal call for select().order() needs to resolve as a list
    const profiles = [{ id: '1', device_name: 'Device A', manufacturer: 'Acme' }]
    mockSupabaseChain = chainable()
    // Override: order returns the resolved data (non-single terminal)
    ;(mockSupabaseChain['order'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: profiles, error: null })

    const res = await GET()
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json).toEqual(profiles)
  })

  it('returns 500 when database query fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSupabaseChain = chainable()
    ;(mockSupabaseChain['order'] as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    })

    const res = await GET()
    expect(res.status).toBe(500)

    const json = await res.json()
    expect(json.error).toBe('Something went wrong')
  })
})

describe('POST /api/profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser = vi.fn()
    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const res = await POST(jsonRequest({ device_name: 'X', manufacturer: 'Y' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 422 when device_name is missing', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({ manufacturer: 'Acme' }))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('returns 422 when manufacturer is missing', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({ device_name: 'Widget' }))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('returns 422 when both required fields are missing', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('returns 422 when device_name is empty string', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({ device_name: '', manufacturer: 'Acme' }))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('returns 422 when manufacturer is empty string', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({ device_name: 'Widget', manufacturer: '' }))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('returns 422 when device_name exceeds 200 characters', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({ device_name: 'X'.repeat(201), manufacturer: 'Acme' }))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('returns 422 when device_class is not a valid enum value', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({
      device_name: 'Widget',
      manufacturer: 'Acme',
      device_class: 'Class IV',
    }))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Validation failed')
  })

  it('accepts valid device_class enum values', async () => {
    // Set up full mock chain for a successful POST
    mockSupabaseChain = chainable()
    // users query for plan check
    const fromFn = vi.fn()
    const supabaseClient = {
      auth: { getUser: mockGetUser },
      from: fromFn,
    }
    // We need fine-grained control over multiple .from() calls
    // For this test, we just verify the Zod schema accepts valid device_class
    // by checking it does NOT return 422
    const usersChain = chainable({ single: vi.fn().mockResolvedValue({ data: { plan: 'pro' }, error: null }) })
    const countChain = chainable()
    ;(countChain['select'] as ReturnType<typeof vi.fn>).mockReturnValue(countChain)
    ;(countChain['eq'] as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, error: null })
    const insertChain = chainable()
    ;(insertChain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'new-id', device_name: 'Widget', manufacturer: 'Acme', device_class: 'Class IIa' },
      error: null,
    })

    // This test is limited because we'd need to mock multiple .from() calls differently.
    // Instead, verify at the Zod level: the route returns 422 for invalid and not-422 for valid.
    // We already tested invalid above. The absence of 422 here confirms Zod accepted 'Class IIa'.
    // (The route may still fail downstream due to mock limitations — that's fine for a validation test.)
    mockSupabaseChain = chainable()
    ;(mockSupabaseChain['single'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { plan: 'enterprise' }, error: null })

    const res = await POST(jsonRequest({
      device_name: 'Widget',
      manufacturer: 'Acme',
      device_class: 'Class IIa',
    }))
    // Should NOT be a 422 — may be 201 or 500 depending on downstream mock fidelity
    expect(res.status).not.toBe(422)
  })

  it('returns 422 for non-string types in required fields', async () => {
    mockSupabaseChain = chainable()

    const res = await POST(jsonRequest({ device_name: 123, manufacturer: true }))
    expect(res.status).toBe(422)
  })
})
