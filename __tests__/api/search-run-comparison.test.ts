import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory PostgREST-like fake. Filters are really applied so the tests
// prove the route's owner/profile/deleted/canary scoping, not just its calls.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const OWNER = '00000000-0000-4000-8000-00000000000a'
const OTHER = '00000000-0000-4000-8000-00000000000b'
const PROFILE = '00000000-0000-4000-8000-0000000000a1'
const OTHER_PROFILE = '00000000-0000-4000-8000-0000000000b1'
const RUN_CURRENT = '11111111-1111-4111-8111-111111111111'
const RUN_PREVIOUS = '22222222-2222-4222-8222-222222222222'
const RUN_OLDER_APPROVED = '33333333-3333-4333-8333-333333333333'
const RUN_OTHER_OWNER = '44444444-4444-4444-8444-444444444444'
const RUN_OTHER_PROFILE = '55555555-5555-4555-8555-555555555555'
const RUN_DELETED = '66666666-6666-4666-8666-666666666666'
const RUN_CANARY = '77777777-7777-4777-8777-777777777777'
const RUN_ERROR = '88888888-8888-4888-8888-888888888888'

let tables: Record<string, Row[]>
let rangeCalls: Array<{ table: string; from: number; to: number }>
let writes: string[]

function makeQuery(table: string) {
  const filters: Filter[] = []
  const orders: Array<{ col: string; asc: boolean }> = []
  let limitN: number | null = null
  let rangeFrom: number | null = null
  let rangeTo: number | null = null

  const run = () => {
    let rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
    rows = [...rows].sort((a, b) => {
      for (const { col, asc } of orders) {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        if (av !== bv) return (av < bv ? -1 : 1) * (asc ? 1 : -1)
      }
      return 0
    })
    if (rangeFrom !== null && rangeTo !== null) rows = rows.slice(rangeFrom, rangeTo + 1)
    if (limitN !== null) rows = rows.slice(0, limitN)
    return rows
  }

  const builder = {
    select: () => builder,
    eq: (col: string, value: unknown) => { filters.push((row) => row[col] === value); return builder },
    neq: (col: string, value: unknown) => { filters.push((row) => row[col] !== value); return builder },
    is: (col: string, value: unknown) => { filters.push((row) => (row[col] ?? null) === value); return builder },
    in: (col: string, values: unknown[]) => { filters.push((row) => values.includes(row[col])); return builder },
    lt: (col: string, value: string) => { filters.push((row) => String(row[col]) < value); return builder },
    order: (col: string, opts?: { ascending?: boolean }) => { orders.push({ col, asc: opts?.ascending !== false }); return builder },
    limit: (n: number) => { limitN = n; return builder },
    range: (from: number, to: number) => {
      rangeFrom = from
      rangeTo = to
      rangeCalls.push({ table, from, to })
      return builder
    },
    maybeSingle: async () => {
      const rows = run()
      return { data: rows[0] ?? null, error: null }
    },
    single: async () => {
      const rows = run()
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'not found', code: 'PGRST116' } }
    },
    update: () => { writes.push(`update:${table}`); return builder },
    insert: () => { writes.push(`insert:${table}`); return builder },
    delete: () => { writes.push(`delete:${table}`); return builder },
    upsert: () => { writes.push(`upsert:${table}`); return builder },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: run(), error: null }).then(resolve, reject),
  }
  return builder
}

let mockGetUser: ReturnType<typeof vi.fn>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeQuery(table) })),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}))

import { GET } from '@/app/api/search-runs/[id]/comparison/route'
import { rateLimit } from '@/lib/rate-limit'

function runRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    user_id: OWNER,
    profile_id: PROFILE,
    status: 'complete',
    review_status: 'draft',
    created_at: '2026-10-01T00:00:00Z',
    period_from: '2026-07-01',
    period_to: '2026-09-30',
    search_period_from: null,
    search_period_to: null,
    dbs_searched: ['bfarm'],
    timing: { source_breakdown: [{ source: 'bfarm', status: 'complete', requested_from: '2026-07-01', requested_to: '2026-09-30' }] },
    profile_snapshot: { device_name: 'Pump', manufacturer: 'Acme' },
    terms_used: { manufacturer_terms: ['acme'], device_terms: ['pump'] },
    deleted_at: null,
    is_synthetic_canary: false,
    ...overrides,
  }
}

function result(id: string, runId: string, externalId: string, overrides: Row = {}): Row {
  return {
    id, run_id: runId, source_db: 'bfarm', external_id: externalId, title: `Notice ${externalId}`,
    fsn_date: '2026-08-01', source_url: null, content_hash: 'h', attachment_digest: null, ...overrides,
  }
}

function request(id: string, query = ''): Request {
  return new Request(`http://localhost/api/search-runs/${id}/comparison${query}`)
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: OWNER } }, error: null })
  rangeCalls = []
  writes = []
  tables = {
    search_runs: [
      runRow(RUN_CURRENT),
      runRow(RUN_PREVIOUS, { created_at: '2026-07-01T00:00:00Z', period_from: '2026-04-01', period_to: '2026-06-30' }),
      runRow(RUN_OLDER_APPROVED, { created_at: '2026-04-01T00:00:00Z', review_status: 'approved' }),
      runRow(RUN_OTHER_OWNER, { user_id: OTHER, created_at: '2026-09-01T00:00:00Z' }),
      runRow(RUN_OTHER_PROFILE, { profile_id: OTHER_PROFILE, created_at: '2026-09-01T00:00:00Z' }),
      runRow(RUN_DELETED, { created_at: '2026-09-15T00:00:00Z', deleted_at: '2026-09-20T00:00:00Z' }),
      runRow(RUN_CANARY, { created_at: '2026-09-16T00:00:00Z', is_synthetic_canary: true }),
      runRow(RUN_ERROR, { created_at: '2026-09-17T00:00:00Z', status: 'error' }),
    ],
    fsn_results: [
      result('r-c1', RUN_CURRENT, 'A'),
      result('r-c2', RUN_CURRENT, 'B'),
      result('r-p1', RUN_PREVIOUS, 'A'),
    ],
    filter_decisions: [
      { id: 'd-c1', fsn_result_id: 'r-c1', search_run_id: RUN_CURRENT, decision: 'relevant', decided_at: '2026-10-01T01:00:00Z' },
      { id: 'd-p1', fsn_result_id: 'r-p1', search_run_id: RUN_PREVIOUS, decision: 'uncertain', decided_at: '2026-07-01T01:00:00Z' },
    ],
    human_adjudication_events: [],
  }
})

describe('GET /api/search-runs/[id]/comparison', () => {
  it('rejects an invalid run id', async () => {
    const res = await GET(request('nope'), params('nope'))
    expect(res.status).toBe(400)
  })

  it('rejects an invalid previous id', async () => {
    const res = await GET(request(RUN_CURRENT, '?previous=not-a-uuid'), params(RUN_CURRENT))
    expect(res.status).toBe(400)
  })

  it('rejects unknown query parameters', async () => {
    const res = await GET(request(RUN_CURRENT, '?foo=1'), params(RUN_CURRENT))
    expect(res.status).toBe(400)
  })

  it('requires authentication', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    const res = await GET(request(RUN_CURRENT), params(RUN_CURRENT))
    expect(res.status).toBe(401)
  })

  it('returns 404 to a non-owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: OTHER } }, error: null })
    const res = await GET(request(RUN_CURRENT), params(RUN_CURRENT))
    expect(res.status).toBe(404)
  })

  it('returns 404 for a deleted or canary current run', async () => {
    expect((await GET(request(RUN_DELETED), params(RUN_DELETED))).status).toBe(404)
    expect((await GET(request(RUN_CANARY), params(RUN_CANARY))).status).toBe(404)
  })

  it('returns 404 when previous belongs to another owner', async () => {
    const res = await GET(request(RUN_CURRENT, `?previous=${RUN_OTHER_OWNER}`), params(RUN_CURRENT))
    expect(res.status).toBe(404)
  })

  it('returns 404 when previous belongs to another profile of the same owner', async () => {
    const res = await GET(request(RUN_CURRENT, `?previous=${RUN_OTHER_PROFILE}`), params(RUN_CURRENT))
    expect(res.status).toBe(404)
  })

  it('returns 404 when previous is deleted or a canary', async () => {
    expect((await GET(request(RUN_CURRENT, `?previous=${RUN_DELETED}`), params(RUN_CURRENT))).status).toBe(404)
    expect((await GET(request(RUN_CURRENT, `?previous=${RUN_CANARY}`), params(RUN_CURRENT))).status).toBe(404)
  })

  it('rejects an explicit previous run that did not finish complete or degraded', async () => {
    const res = await GET(request(RUN_CURRENT, `?previous=${RUN_ERROR}`), params(RUN_CURRENT))
    expect(res.status).toBe(422)
  })

  it('auto-selects the latest eligible earlier run, skipping other owners, profiles, deleted, canary and error runs', async () => {
    const res = await GET(request(RUN_CURRENT), params(RUN_CURRENT))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.previous_run_id).toBe(RUN_PREVIOUS)
    expect(json.records.new.map((r: { external_id: string }) => r.external_id)).toEqual(['B'])
    expect(json.records.decision_changed).toHaveLength(1)
    expect(json.records.decision_changed[0].from).toEqual({ decision: 'uncertain', origin: 'ai', human_state: null })
    expect(json.completeness.comparable).toBe(true)
    expect(rateLimit).toHaveBeenCalledWith(`search-run-comparison:${OWNER}`, 20, 60_000)
  })

  it('prefers an approved earlier run when asked', async () => {
    const res = await GET(request(RUN_CURRENT, '?prefer_approved=true'), params(RUN_CURRENT))
    const json = await res.json()
    expect(json.previous_run_id).toBe(RUN_OLDER_APPROVED)
  })

  it('accepts an explicit same-owner, same-profile previous run', async () => {
    const res = await GET(request(RUN_CURRENT, `?previous=${RUN_OLDER_APPROVED}`), params(RUN_CURRENT))
    expect(res.status).toBe(200)
    expect((await res.json()).previous_run_id).toBe(RUN_OLDER_APPROVED)
  })

  it('returns an explicit no-previous result for the first run', async () => {
    const res = await GET(request(RUN_OLDER_APPROVED), params(RUN_OLDER_APPROVED))
    const json = await res.json()
    expect(json.previous_run_id).toBeNull()
    expect(json.completeness.comparable).toBe(false)
  })

  it('pages every per-run list past the 1,000-row response cap', async () => {
    const many = Array.from({ length: 1_500 }, (_, i) => result(`r-x${String(i).padStart(5, '0')}`, RUN_CURRENT, `X${i}`))
    tables.fsn_results.push(...many)
    const res = await GET(request(RUN_CURRENT), params(RUN_CURRENT))
    const json = await res.json()
    expect(json.records.new).toHaveLength(1_501)
    const currentPages = rangeCalls.filter((call) => call.table === 'fsn_results').map(({ from, to }) => [from, to])
    expect(currentPages).toEqual(expect.arrayContaining([[0, 999], [1000, 1999]]))
    for (const table of ['fsn_results', 'filter_decisions', 'human_adjudication_events']) {
      expect(rangeCalls.some((call) => call.table === table)).toBe(true)
    }
  })

  it('never writes', async () => {
    await GET(request(RUN_CURRENT), params(RUN_CURRENT))
    expect(writes).toEqual([])
  })
})
