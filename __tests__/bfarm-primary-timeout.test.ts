import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

const fallbackItem: ScrapedFsn = {
  external_id:  'firecrawl-1',
  title:        'Firecrawl fallback FSN',
  manufacturer: 'Acme GmbH',
  product_name: null,
  fsn_date:     '2026-06-01',
  source_url:   'https://www.bfarm.de/fallback',
  raw_content:  'Firecrawl fallback FSN',
  source_db:    'bfarm',
}

const firecrawlFallback = vi.fn(async () => ({
  items:    [fallbackItem],
  warnings: ['BfArM primary scraper returned empty — results via Firecrawl fallback'],
}))

vi.mock('@/lib/scrapers/firecrawl', () => ({
  firecrawlFallback,
}))

describe('scrapeBfarm primary timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    firecrawlFallback.mockClear()
  })

  it('falls back to Firecrawl within the configured primary budget', async () => {
    vi.useFakeTimers()
    vi.stubEnv('BFARM_PRIMARY_TIMEOUT_MS', '25')
    let primaryAborted = false
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          primaryAborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
        setTimeout(() => {
          resolve(new Response('', { headers: { 'content-type': 'text/html; charset=utf-8' } }))
        }, 100)
      })
    ))

    const { scrapeBfarm } = await import('@/lib/scrapers/bfarm')

    const pending = scrapeBfarm({
      fromDate: '2026-06-01',
      toDate:   '2026-06-30',
    })

    await vi.advanceTimersByTimeAsync(24)
    expect(firecrawlFallback).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    const result = await pending

    expect(firecrawlFallback).toHaveBeenCalledOnce()
    expect(primaryAborted).toBe(true)
    expect(result.items).toEqual([fallbackItem])
  })

  it('does not spend Firecrawl budget on same-day BfArM HTTP 403 checks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T10:00:00.000Z'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))

    const { scrapeBfarm } = await import('@/lib/scrapers/bfarm')

    const result = await scrapeBfarm({
      fromDate: '2026-07-01',
      toDate:   '2026-07-01',
    })

    expect(firecrawlFallback).not.toHaveBeenCalled()
    expect(result.outcome).toBe('failed')
    expect(result.warnings).toContain(
      'BfArM current-day live check was blocked by the authority site (HTTP 403); cached historical coverage was retained and this one-day freshness check requires retry.',
    )
  })
})
