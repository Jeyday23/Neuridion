import { describe, expect, it } from 'vitest'
import { derivePageOrdinal, extractCoverage } from '@/lib/scrapers/firecrawl-coverage'

const SEARCH_BASE = 'https://www.bfarm.de/SiteGlobals/Forms/Suche/Expertensuche_Formular.html' +
  '?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=30' +
  '&input_Datum_VON=01.06.2026&input_Datum_BIS=01.07.2026&submit=Senden'

function pageUrl(page: number): string {
  return page > 1 ? `${SEARCH_BASE}&gtp=469344_list%253D${page}` : SEARCH_BASE
}

function teaser(id: string, dateText: string): string {
  return `
    <li class="l-teaser-list__item">
      <a class="c-icon-teaser__link--download" href="/SharedDocs/Kundeninfos/DE/10/2026/${id}_kundeninfo_de.html">
        <span class="c-icon-teaser__headline">Dringende Sicherheitsinformation zu Test Device von Acme GmbH</span>
      </a>
      <span class="c-icon-teaser__date">${dateText}</span>
      <span class="c-icon-teaser__reference">Referenznummer: ${id.replace('-', '/')}</span>
    </li>
  `
}

function page(items: string[]): string {
  return `<html><body><ul>${items.join('\n')}</ul></body></html>`
}

const FROM_DATE = new Date('2026-06-01T00:00:00.000Z')
const TO_DATE = new Date('2026-07-01T23:59:59.999Z')

describe('derivePageOrdinal', () => {
  it('treats the seed BfArM search URL (no gtp param) as page 1', () => {
    expect(derivePageOrdinal(SEARCH_BASE)).toBe(1)
  })

  it('recovers the ordinal from a single-encoded gtp pagination param', () => {
    expect(derivePageOrdinal(`${SEARCH_BASE}&gtp=469344_list%3D5`)).toBe(5)
  })

  it('recovers the ordinal from a double-encoded gtp pagination param', () => {
    expect(derivePageOrdinal(`${SEARCH_BASE}&gtp=469344_list%253D5`)).toBe(5)
  })

  it('returns null for a URL with no recognizable pagination marker and no search path', () => {
    expect(derivePageOrdinal('https://www.bfarm.de/some/other/redirected-page.html')).toBeNull()
  })

  it('returns null for an undefined URL', () => {
    expect(derivePageOrdinal(undefined)).toBeNull()
  })
})

describe('extractCoverage certification (production incident 517e70c9)', () => {
  it('certifies coverage complete when contiguous pages 1..N cross below fromDate', () => {
    const pages = [
      { url: pageUrl(1), html: page([teaser('26010-26', '28. Juni 2026')]) },
      { url: pageUrl(2), html: page([teaser('26009-26', '20. Juni 2026')]) },
      { url: pageUrl(3), html: page([teaser('26008-26', '15. Mai 2026')]) }, // crosses below fromDate
    ]

    const coverage = extractCoverage(pages, FROM_DATE, TO_DATE)

    expect(coverage.coverageComplete).toBe(true)
    expect(coverage.items.map(item => item.external_id)).toEqual(['26010-26', '26009-26'])
  })

  it('does NOT certify coverage complete when crawled pages have a pagination gap, even if a later page crosses below fromDate', () => {
    // Reproduces production incident 517e70c9: the broad crawl skipped an
    // intermediate result page (page 3) yet still landed on a page whose
    // items predate fromDate. That must never be certified complete.
    const pages = [
      { url: pageUrl(1), html: page([teaser('26010-26', '28. Juni 2026')]) },
      { url: pageUrl(2), html: page([teaser('26009-26', '20. Juni 2026')]) },
      // page 3 missing — gap
      { url: pageUrl(4), html: page([teaser('26007-26', '15. Mai 2026')]) }, // crosses below fromDate
    ]

    const coverage = extractCoverage(pages, FROM_DATE, TO_DATE)

    expect(coverage.coverageComplete).toBe(false)
  })

  it('does NOT certify coverage complete when contiguous pages never cross below fromDate', () => {
    const pages = [
      { url: pageUrl(1), html: page([teaser('26010-26', '28. Juni 2026')]) },
      { url: pageUrl(2), html: page([teaser('26009-26', '20. Juni 2026')]) },
      { url: pageUrl(3), html: page([teaser('26008-26', '10. Juni 2026')]) },
    ]

    const coverage = extractCoverage(pages, FROM_DATE, TO_DATE)

    expect(coverage.coverageComplete).toBe(false)
    expect(coverage.items).toHaveLength(3)
  })

  it('does NOT certify coverage complete when a crawled page beyond the first has no recognizable pagination ordinal', () => {
    const pages = [
      { url: pageUrl(1), html: page([teaser('26010-26', '28. Juni 2026')]) },
      // A page Firecrawl reached via some other discovered link, with no
      // BfArM pagination marker at all.
      { url: 'https://www.bfarm.de/some/other/redirected-page.html', html: page([teaser('26007-26', '15. Mai 2026')]) },
    ]

    const coverage = extractCoverage(pages, FROM_DATE, TO_DATE)

    expect(coverage.coverageComplete).toBe(false)
  })

  it('does NOT certify coverage complete when a page within the contiguous run failed to parse', () => {
    const pages = [
      { url: pageUrl(1), html: page([teaser('26010-26', '28. Juni 2026')]) },
      { url: pageUrl(2), html: '<html><body>blocked / no rows</body></html>' },
      { url: pageUrl(3), html: page([teaser('26008-26', '15. Mai 2026')]) },
    ]

    const coverage = extractCoverage(pages, FROM_DATE, TO_DATE)

    expect(coverage.coverageComplete).toBe(false)
  })

  it('does NOT certify coverage complete for an empty page set', () => {
    expect(extractCoverage([], FROM_DATE, TO_DATE).coverageComplete).toBe(false)
  })
})
