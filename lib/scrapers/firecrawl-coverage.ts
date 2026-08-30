import { parsePage, BFARM_ORIGIN, type ParsedItem, type ScrapedFsn } from './bfarm'
import { sanitizeContent } from './sanitize'

/**
 * A single page fetched during a Firecrawl broad crawl of the BfArM result
 * list. `url` is the URL Firecrawl actually crawled — it is the only signal
 * available for reconstructing where in the paginated result list this page
 * sits, because Firecrawl's crawler discovers pages by following links and
 * does not guarantee it visits every page, or visits them in order.
 */
export interface CrawledPage {
  url?:  string
  html?: string
}

export interface CoverageResult {
  items:            ScrapedFsn[]
  coverageComplete: boolean
}

const SEARCH_PATH = '/SiteGlobals/Forms/Suche/Expertensuche_Formular.html'
// BfArM's pagination link encodes the page number as `gtp=<id>_list=<page>`.
// Firecrawl (and our own request builder in bfarmPageUrl/bfarmArchivePageUrl)
// URL-encode the `=` once or twice depending on the code path, so match all
// three shapes.
const PAGE_ORDINAL_PATTERN = /_list(?:%253D|%3D|=)(\d+)/i

/**
 * Recovers a page's position in the BfArM result-list pagination sequence
 * from its crawled URL. Returns null when the URL carries no pagination
 * marker BfArM itself would generate and does not look like the seed
 * (first) results page — i.e. when the page cannot be placed in the
 * sequence at all.
 */
export function derivePageOrdinal(url: string | undefined): number | null {
  if (!url) return null

  const match = url.match(PAGE_ORDINAL_PATTERN)
  if (match) {
    const ordinal = Number(match[1])
    return Number.isFinite(ordinal) && ordinal > 0 ? ordinal : null
  }

  // No pagination marker: only the seed/first results page is expected to
  // look like this.
  return url.includes(SEARCH_PATH) ? 1 : null
}

function isContiguousFromOne(ordinals: number[], maxOrdinal: number): boolean {
  if (maxOrdinal <= 0) return false
  const seen = new Set(ordinals)
  for (let n = 1; n <= maxOrdinal; n++) {
    if (!seen.has(n)) return false
  }
  return true
}

interface AnalyzedPage {
  ordinal: number | null
  items:   ParsedItem[]
  parsed:  boolean
}

/**
 * A Firecrawl broad crawl can skip intermediate BfArM result pages while
 * still landing on a later page whose items are older than the requested
 * `fromDate`. Seeing an old-dated item anywhere in the crawl is therefore
 * not proof every page between the first result and that boundary was
 * actually seen — production incident 517e70c9 (2026-08-30) certified a
 * 41/60-item fallback "complete" on exactly this gap. Coverage may only be
 * certified when the crawled pages provably form a contiguous 1..N
 * pagination run that reaches the fromDate boundary, with every page in
 * that run successfully parsed.
 */
function certifyContiguousCoverage(pages: AnalyzedPage[], fromDate: Date): boolean {
  if (pages.length === 0) return false
  if (pages.some(page => page.ordinal === null)) return false

  const ordinals = pages.map(page => page.ordinal as number)
  const maxOrdinal = Math.max(...ordinals)
  if (!isContiguousFromOne(ordinals, maxOrdinal)) return false

  if (pages.some(page => !page.parsed)) return false

  return pages.some(page => page.items.some(item => item.date !== null && item.date < fromDate))
}

export function toScrapedCoverage(
  allParsed: ParsedItem[],
  fromDate: Date,
  toDate: Date,
): { items: ScrapedFsn[] } {
  const inRange: ScrapedFsn[] = allParsed
    .filter(item => item.date && item.date >= fromDate && item.date <= toDate)
    .map(item => ({
      external_id:  item.externalId,
      title:        item.title,
      manufacturer: item.manufacturer,
      product_name: null,
      fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
      source_url:   `${BFARM_ORIGIN}${item.href}`,
      raw_content:  sanitizeContent(item.title),
      source_db:    'bfarm',
    }))

  const seen = new Set<string>()
  const items = inRange.filter(item => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })

  return { items }
}

export function extractCoverage(
  pages: CrawledPage[],
  fromDate: Date,
  toDate: Date,
): CoverageResult {
  const analyzed: AnalyzedPage[] = pages.map(page => {
    const items = page.html ? parsePage(page.html) : []
    return {
      ordinal: derivePageOrdinal(page.url),
      items,
      parsed: items.length > 0,
    }
  })

  const allParsed = analyzed.flatMap(page => page.items)
  const { items } = toScrapedCoverage(allParsed, fromDate, toDate)

  return {
    items,
    coverageComplete: certifyContiguousCoverage(analyzed, fromDate),
  }
}
