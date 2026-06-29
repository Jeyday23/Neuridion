import { afterEach, describe, expect, it, vi } from 'vitest'

function teaser(id: string, dateText: string, title = 'Dringende Sicherheitsinformation zu Test Device von Acme GmbH'): string {
  return `
    <li class="l-teaser-list__item">
      <a href="/SharedDocs/Kundeninfos/DE/10/2026/${id}_kundeninfo_de.html">
        <span class="c-icon-teaser__headline">${title}</span>
      </a>
      <span class="c-icon-teaser__date">${dateText}</span>
    </li>
  `
}

function page(items: string[]): string {
  return `<html><body><ul>${items.join('\n')}</ul></body></html>`
}

function mockFirecrawl(data: Array<{ html: string }>) {
  vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test')
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const href = String(url)
    if (href.endsWith('/crawl')) {
      return new Response(JSON.stringify({ id: 'crawl-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (href.endsWith('/crawl/crawl-1')) {
      return new Response(JSON.stringify({ status: 'completed', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`Unexpected URL: ${href}`)
  }))
}

describe('Firecrawl BfArM fallback coverage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns complete fallback coverage when crawled pages cross below the requested fromDate', async () => {
    vi.useFakeTimers()
    const { firecrawlFallback } = await import('@/lib/scrapers/firecrawl')
    mockFirecrawl([
      { html: page([teaser('26008-26', '26. Juni 2026')]) },
      { html: page([teaser('26007-26', '21. Juni 2026')]) },
    ])

    const pending = firecrawlFallback({
      fromDate: '2026-06-22',
      toDate: '2026-06-29',
    })
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result.items).toHaveLength(1)
    expect(result.outcome).toBe('complete')
    expect(result.warnings).toEqual([])
  })

  it('keeps fallback partial when crawled pages do not prove complete date-range coverage', async () => {
    vi.useFakeTimers()
    const { firecrawlFallback } = await import('@/lib/scrapers/firecrawl')
    mockFirecrawl([
      { html: page([teaser('26008-26', '26. Juni 2026')]) },
      { html: page([teaser('26007-26', '25. Juni 2026')]) },
      { html: page([teaser('26006-26', '24. Juni 2026')]) },
      { html: page([teaser('26005-26', '23. Juni 2026')]) },
      { html: page([teaser('26004-26', '22. Juni 2026')]) },
    ])

    const pending = firecrawlFallback({
      fromDate: '2026-06-22',
      toDate: '2026-06-29',
    })
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result.items).toHaveLength(5)
    expect(result.outcome).toBe('partial')
    expect(result.warnings).toEqual([
      'BfArM fallback returned items but could not prove complete date-range coverage',
    ])
  })
})
