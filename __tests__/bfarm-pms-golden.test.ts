import { afterEach, describe, expect, it, vi } from 'vitest'
import golden from './fixtures/bfarm-pms-2026.json'
import { parseNextPageHref, parsePage, scrapeBfArM, scrapeBfarm } from '@/lib/scrapers/bfarm'

function teaser(record: (typeof golden)[number]): string {
  const [year, month, day] = record.date.split('-')
  const id = record.reference.replace('/', '-')
  const pdfYear = record.reference === '48934/25' ? '2025' : '2026'
  return `
    <li data-kind="fsn" class="featured l-teaser-list__item">
      <span class="extra c-icon-teaser__headline">Dringende Sicherheitsinformation zu ${record.product} von ${record.manufacturer}</span>
      <a title="PDF" class="other c-icon-teaser__link--download" href="/SharedDocs/Kundeninfos/DE/09/${pdfYear}/${id}_kundeninfo_de.pdf?__blob=publicationFile&amp;v=1">PDF</a>
      <span class="c-icon-teaser__date muted">Datum: ${day}.${month}.${year}</span>
      <span class="meta c-icon-teaser__reference">Referenznummer: ${record.reference}</span>
    </li>`
}

describe('BfArM reviewed PMS golden set', () => {
  afterEach(() => vi.restoreAllMocks())

  it('extracts all 15 reviewed records with stable references and metadata', () => {
    const parsed = parsePage(`<ul>${golden.map(teaser).join('')}</ul>`)

    expect(parsed).toHaveLength(15)
    expect(parsed.map(item => ({
      date: item.date?.toISOString().slice(0, 10),
      reference: item.reference,
      product: item.productName,
      manufacturer: item.manufacturer,
    }))).toEqual(golden)
    expect(parsed[0].href).toContain('__blob=publicationFile&v=1')
  })

  it('separates BfArM download metadata from title/manufacturer and uses the notice date', () => {
    const parsed = parsePage(`
      <li class="l-teaser-list__item">
        <h3 class="c-icon-teaser__headline">
          Dringende Sicherheitsinformation zu ORBIS Medication von DH Healthcare GmbH
          PDF, 687KB, Datei ist nicht barrierefrei Datum: 13. April 2026
          Themen: Medizinprodukte Dokumenttyp: Kundeninformation
        </h3>
        <span class="c-icon-teaser__date">30. April 2026</span>
        <span class="c-icon-teaser__reference">11546/26</span>
        <a class="c-icon-teaser__link--download" href="/SharedDocs/Kundeninfos/DE/09/2026/11546-26_kundeninfo_de.pdf">PDF</a>
      </li>
    `)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      title: 'Dringende Sicherheitsinformation zu ORBIS Medication von DH Healthcare GmbH',
      manufacturer: 'DH Healthcare GmbH',
      productName: 'ORBIS Medication',
      externalId: '11546-26',
    })
    expect(parsed[0].date?.toISOString().slice(0, 10)).toBe('2026-04-13')
  })

  it('extracts and decodes the forward navigation href', () => {
    const html = `<li class="is-forward extra c-navindex__item"><a aria-label="Weiter" href="/search?gtp=469344_list%3D2&amp;foo=bar">Weiter</a></li>`
    expect(parseNextPageHref(html)).toBe('/search?gtp=469344_list%3D2&foo=bar')
  })

  it('extracts the forward navigation href when production HTML nesting hides it from shallow parsing', () => {
    const html = `
      <li class="c-navindex__item is-forward">
        <span><svg><g><path /></g></svg></span>
        <div>
          <a title="Seite 2" href="SiteGlobals/Forms/Suche/Expertensuche_Formular.html?gtp=469344_list%253D2&amp;resultsPerPage=30#results">
            Weiter
          </a>
        </div>
      </li>
    `

    expect(parseNextPageHref(html)).toBe(
      'SiteGlobals/Forms/Suche/Expertensuche_Formular.html?gtp=469344_list%253D2&resultsPerPage=30#results',
    )
  })

  it('marks a full BfArM page as partial when pagination exists but no next href can be parsed', async () => {
    const records = Array.from({ length: 30 }, (_, index) => ({
      ...golden[index % golden.length],
      date: '2026-06-19',
      reference: `${30000 + index}/26`,
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <ul>${records.map(teaser).join('')}</ul>
      <li class="c-navindex__item is-forward"><span>Weiter</span></li>
    `, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })))

    const result = await scrapeBfArM({
      fromDate: new Date('2026-06-01T00:00:00.000Z'),
      toDate: new Date('2026-06-30T23:59:59.999Z'),
    })

    expect(result.items).toHaveLength(30)
    expect(result.outcome).toBe('partial')
    expect(result.warnings).toEqual([
      'BfArM: pagination continuation was present on page 1, but the next-page link could not be parsed; source coverage is incomplete.',
    ])
  })

  it('rejects an out-of-range targeted-search hit even when BfArM returns it', async () => {
    const old = { ...golden[1], date: '2022-06-22', reference: '14919/22' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`<ul>${teaser(old)}</ul>`, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })))

    const result = await scrapeBfArM({
      fromDate: new Date('2026-01-05T00:00:00.000Z'),
      toDate: new Date('2026-04-15T23:59:59.999Z'),
      query: 'COPRA6',
    })

    expect(result.items).toEqual([])
  })

  it('combines targeted discovery with archive discovery for long profile windows', async () => {
    const copra = golden.find(record => record.reference === '14727/26')!
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const html = url.includes('templateQueryString=COPRA6')
        ? `<ul>${teaser(copra)}</ul>`
        : '<ul></ul>'
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeBfarm({
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
      profile: { manufacturer: 'COPRA System GmbH', device_name: 'COPRA6' },
      searchTerms: ['copra', 'copra6'],
    })

    expect(result.items.map(item => item.external_id)).toContain('14727-26')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('dateOfIssue_dt=current_year'))).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('templateQueryString=COPRA6'))).toBe(true)
  })

  it('uses exact-date discovery for medium profile windows', async () => {
    const copra = golden.find(record => record.reference === '14727/26')!
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const html = url.includes('templateQueryString=COPRA6')
        ? `<ul>${teaser(copra)}</ul>`
        : '<ul></ul>'
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeBfarm({
      fromDate: '2026-01-01',
      toDate: '2026-04-30',
      profile: { manufacturer: 'COPRA System GmbH', device_name: 'COPRA6' },
      searchTerms: ['copra', 'copra6'],
    })

    expect(result.items.map(item => item.external_id)).toContain('14727-26')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('dateOfIssue_dt='))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('input_Datum_VON=01.01.2026'))).toBe(true)
  })
})
