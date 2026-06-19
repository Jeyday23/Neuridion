import { afterEach, describe, expect, it, vi } from 'vitest'
import golden from './fixtures/bfarm-pms-2026.json'
import { parseNextPageHref, parsePage, scrapeBfArM } from '@/lib/scrapers/bfarm'

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

  it('extracts and decodes the forward navigation href', () => {
    const html = `<li class="is-forward extra c-navindex__item"><a aria-label="Weiter" href="/search?gtp=469344_list%3D2&amp;foo=bar">Weiter</a></li>`
    expect(parseNextPageHref(html)).toBe('/search?gtp=469344_list%3D2&foo=bar')
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
})
