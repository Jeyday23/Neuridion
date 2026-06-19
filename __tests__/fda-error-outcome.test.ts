import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrapeFdaMaude } from '@/lib/scrapers/fda-maude'

describe('FDA source failure outcomes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('marks non-NOT_FOUND API errors as partial rather than valid empty data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: '403', message: 'Forbidden' },
    }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })))

    const result = await scrapeFdaMaude({
      fromDate: '2024-10-01',
      toDate: '2024-10-07',
      searchTerms: ['Medtronic'],
    })

    expect(result.items).toEqual([])
    expect(result.outcome).toBe('partial')
    expect(result.warnings).toContainEqual(expect.stringContaining('API error 403'))
  })

  it('falls back to the public endpoint when an optional API key is rejected', async () => {
    const previousKey = process.env.OPENFDA_API_KEY
    process.env.OPENFDA_API_KEY = 'stale-test-key'
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('api_key=')) {
        return new Response(JSON.stringify({ error: { code: '403', message: 'Forbidden' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        meta: { results: { total: 0 } },
        error: { code: 'NOT_FOUND', message: 'No matches found' },
      }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await scrapeFdaMaude({
        fromDate: '2024-10-01',
        toDate: '2024-10-07',
        searchTerms: ['Medtronic'],
      })

      expect(result.outcome).toBe('empty')
      expect(result.warnings).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(String(fetchMock.mock.calls[1][0])).not.toContain('api_key=')
    } finally {
      if (previousKey === undefined) delete process.env.OPENFDA_API_KEY
      else process.env.OPENFDA_API_KEY = previousKey
    }
  })

  it('reports a transient network error and its successful recovery', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        meta: { results: { total: 1 } },
        results: [{ report_number: 'MDR-1', date_received: '20260110', device: [{ brand_name: 'Infusomat', manufacturer_d_name: 'B. Braun' }] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeFdaMaude({
      fromDate: '2026-01-10',
      toDate: '2026-01-10',
      searchTerms: ['Infusomat'],
    })

    expect(result.outcome).toBe('complete')
    expect(result.items).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('transient fetch error on attempt 1/3: TypeError: fetch failed'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('request recovered on attempt 2/3'))
  })
})
