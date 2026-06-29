import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrapeBfarm, scrapeBfArM } from '@/lib/scrapers/bfarm'

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

describe('scrapeBfArM pagination bounds', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stops after the first page when that page already crossed below fromDate', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('gtp=469344_list%3D2')) {
        return new Response(page([
          teaser('26003-26', '3. Juni 2026', 'Older page item'),
        ]), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      }

      return new Response(page([
        teaser('26008-26', '17. Juni 2026'),
        teaser('26007-26', '12. Juni 2026'),
        teaser('26006-26', '3. Juni 2026', 'Older boundary item'),
        ...Array.from({ length: 27 }, (_, index) =>
          teaser(`250${String(index).padStart(2, '0')}-26`, '2. Juni 2026', `Older filler item ${index}`)
        ),
      ]), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeBfArM({
      fromDate: new Date('2026-06-11T00:00:00.000Z'),
      toDate:   new Date('2026-06-18T23:59:59.999Z'),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.items.map((item) => item.external_id)).toEqual(['26008-26', '26007-26'])
  })

  it('retains exact HTML bytes only when raw evidence capture is requested', async () => {
    const html = page([teaser('26008-26', '17. Juni 2026')])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })))

    const captured = await scrapeBfArM({
      fromDate: new Date('2026-06-11T00:00:00.000Z'),
      toDate: new Date('2026-06-18T23:59:59.999Z'),
      query: 'Test Device',
      captureRawEvidence: true,
    })
    const ordinary = await scrapeBfArM({
      fromDate: new Date('2026-06-11T00:00:00.000Z'),
      toDate: new Date('2026-06-18T23:59:59.999Z'),
      query: 'Test Device',
    })

    expect(captured.rawArtifacts).toHaveLength(1)
    expect(new TextDecoder().decode(captured.rawArtifacts![0].bytes)).toBe(html)
    expect(captured.rawArtifacts![0]).toMatchObject({
      mediaType: 'text/html',
      httpStatus: 200,
    })
    expect(captured.rawArtifacts![0].sourceUrl).toContain('templateQueryString=Test%20Device')
    expect(ordinary.rawArtifacts).toBeUndefined()
  })

  it('retries transient BfArM archive rate limits without downgrading recovered coverage', async () => {
    const pageOne = `
      <html><body>
        <ul>
          ${teaser('26008-26', '17. Juni 2026')}
          <li class="c-navindex__item is-forward">
            <a href="/SiteGlobals/Forms/Suche/Expertensuche_Formular.html?cl2Categories_Format=kundeninfo&amp;dateOfIssue_dt=current_year&amp;cl2Categories_Rubrik=medizinprodukte&amp;resultsPerPage=30&amp;gtp=469344_list%3D2">Weiter</a>
          </li>
        </ul>
      </body></html>
    `
    const pageTwo = page([
      teaser('26007-26', '16. Juni 2026'),
    ])
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('gtp=469344_list%3D2') && fetchMock.mock.calls.filter(([callUrl]) => String(callUrl).includes('gtp=469344_list%3D2')).length === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      }
      if (href.includes('gtp=469344_list%3D2')) {
        return new Response(pageTwo, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      return new Response(pageOne, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeBfarm({
      fromDate: '2026-01-01',
      toDate: '2026-07-02',
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.outcome).toBe('complete')
    expect(result.warnings).toEqual([])
    expect(result.items.map((item) => item.external_id)).toEqual(['26008-26', '26007-26'])
  })
})
