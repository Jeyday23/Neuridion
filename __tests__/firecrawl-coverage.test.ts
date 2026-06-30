import { afterEach, describe, expect, it, vi } from 'vitest'

function teaser(id: string, dateText: string, title = 'Dringende Sicherheitsinformation zu Test Device von Acme GmbH'): string {
  return `
    <li class="l-teaser-list__item">
      <a class="c-icon-teaser__link--download" href="/SharedDocs/Kundeninfos/DE/10/2026/${id}_kundeninfo_de.html">
        <span class="c-icon-teaser__headline">${title}</span>
      </a>
      <span class="c-icon-teaser__date">${dateText}</span>
      <span class="c-icon-teaser__reference">Referenznummer: ${id.replace('-', '/')}</span>
    </li>
  `
}

function page(items: string[], nextHref?: string): string {
  return `<html><body><ul>${items.join('\n')}</ul>${
    nextHref
      ? `<li class="c-navindex__item is-forward"><a href="${nextHref.replace(/&/g, '&amp;')}">Weiter</a></li>`
      : ''
  }</body></html>`
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

  it('walks exact BfArM pagination pages and includes the 04 June Stella sentinel record', async () => {
    const { firecrawlFallback } = await import('@/lib/scrapers/firecrawl')
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test')

    const page1Href = 'https://www.bfarm.de/SiteGlobals/Forms/Suche/Expertensuche_Formular.html?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=30&input_Datum_VON=19.05.2026&input_Datum_BIS=19.06.2026&submit=Senden'
    const page2Href = 'SiteGlobals/Forms/Suche/Expertensuche_Formular.html?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&gtp=469344_list%253D2&resultsPerPage=30#results'
    const page3Href = 'SiteGlobals/Forms/Suche/Expertensuche_Formular.html?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&gtp=469344_list%253D3&resultsPerPage=30#results'
    const pages = new Map<string, string>([
      [page1Href, page([
        teaser('22001-26', '19. Juni 2026'),
        teaser('21001-26', '11. Juni 2026'),
      ], page2Href)],
      [new URL(page2Href, 'https://www.bfarm.de').toString(), page([
        teaser(
          '20020-26',
          '04. Juni 2026',
          'Dringende Sicherheitsinformation zu Stella 2.0 Implantat-Orientierungsdiagramm (IOCI) von STAAR Surgical AG',
        ),
        teaser('19001-26', '28. Mai 2026'),
      ], page3Href)],
      [new URL(page3Href, 'https://www.bfarm.de').toString(), page([
        teaser('18001-26', '18. Mai 2026'),
      ])],
    ])

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      if (href.endsWith('/scrape')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { url: string }
        const html = pages.get(body.url)
        if (!html) throw new Error(`Unexpected scrape URL: ${body.url}`)
        return new Response(JSON.stringify({ data: { html } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected URL: ${href}`)
    }))

    const result = await firecrawlFallback({
      fromDate: '2026-05-19',
      toDate: '2026-06-19',
    })

    expect(result.outcome).toBe('complete')
    expect(result.warnings).toEqual([])
    expect(result.items.map(item => item.external_id)).toContain('20020-26')
    expect(result.items.find(item => item.external_id === '20020-26')).toMatchObject({
      fsn_date: '2026-06-04',
      manufacturer: 'STAAR Surgical AG',
    })
    expect(result.items).toHaveLength(4)
  })

  it('uses BfArM archive shortcuts for long Firecrawl ranges and synthesizes missing next pages', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-30T00:00:00.000Z') })
    const { firecrawlFallback } = await import('@/lib/scrapers/firecrawl')
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test')
    const requests: string[] = []

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      if (href.endsWith('/scrape')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { url: string }
        requests.push(body.url)
        const isCurrentYear = body.url.includes('dateOfIssue_dt=current_year')
        const isLastYear = body.url.includes('dateOfIssue_dt=lastyear')
        const isPage2 = body.url.includes('gtp=469344_list%253D2')
        if (isCurrentYear && isPage2) {
          return new Response(JSON.stringify({
            data: { html: page([teaser('26100-26', '01. Juni 2026')]) },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (isLastYear && isPage2) {
          return new Response(JSON.stringify({
            data: { html: page([teaser('18999-25', '29. Juni 2025')]) },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({
          data: {
            html: page(Array.from({ length: 30 }, (_, index) =>
              teaser(`${(isLastYear ? 25000 : 26000) + index}-${isLastYear ? '25' : '26'}`, isLastYear ? '15. Dezember 2025' : '19. Juni 2026'),
            )),
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected URL: ${href}`)
    }))

    const result = await firecrawlFallback({
      fromDate: '2025-06-30',
      toDate: '2026-06-30',
    })

    expect(result.items).toHaveLength(61)
    expect(result.outcome).toBe('complete')
    expect(result.warnings).toEqual([])
    expect(requests).toHaveLength(4)
    expect(requests.some(request => request.includes('dateOfIssue_dt=current_year'))).toBe(true)
    expect(requests.some(request => request.includes('dateOfIssue_dt=current_year') && request.includes('gtp=469344_list%253D2'))).toBe(true)
    expect(requests.some(request => request.includes('dateOfIssue_dt=lastyear'))).toBe(true)
    expect(requests.some(request => request.includes('dateOfIssue_dt=lastyear') && request.includes('gtp=469344_list%253D2'))).toBe(true)
  })

  it('keeps synthesized Firecrawl pagination partial when the next page repeats', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-30T00:00:00.000Z') })
    const { firecrawlFallback } = await import('@/lib/scrapers/firecrawl')
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test')
    const fullPage = page(Array.from({ length: 30 }, (_, index) =>
      teaser(`${26000 + index}-26`, '19. Juni 2026'),
    ))

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/scrape')) {
        return new Response(JSON.stringify({ data: { html: fullPage } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected URL: ${href}`)
    }))

    const result = await firecrawlFallback({
      fromDate: '2025-06-30',
      toDate: '2026-06-30',
    })

    expect(result.items).toHaveLength(30)
    expect(result.outcome).toBe('partial')
    expect(result.warnings).toEqual([
      'BfArM fallback pagination stopped at page 2: repeated result page detected; source coverage is incomplete.',
      'BfArM fallback returned items but could not prove complete date-range pagination coverage',
    ])
  })

  it('does not mark legacy crawl fallback complete just because the crawler returned fewer pages than the crawl limit', async () => {
    vi.useFakeTimers()
    const { firecrawlFallback } = await import('@/lib/scrapers/firecrawl')
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test')
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/scrape')) {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (href.endsWith('/crawl')) {
        return new Response(JSON.stringify({ id: 'crawl-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (href.endsWith('/crawl/crawl-1')) {
        return new Response(JSON.stringify({
          status: 'completed',
          data: [{ html: page([teaser('26008-26', '26. Juni 2026')]) }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected URL: ${href}`)
    }))

    const pending = firecrawlFallback({
      fromDate: '2026-06-22',
      toDate: '2026-06-29',
    })
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result.items).toHaveLength(1)
    expect(result.outcome).toBe('partial')
    expect(result.warnings).toEqual([
      'BfArM fallback returned items but could not prove complete date-range coverage',
    ])
  })
})
