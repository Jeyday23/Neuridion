import { parseStringPromise } from 'xml2js'
import { daysBetween } from '@/lib/utils/date-chunks'
import { sanitizeContent } from './sanitize'

export const BFARM_ORIGIN = 'https://www.bfarm.de'
const SEARCH_BASE  = `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html`
const RSS_URL      = `${BFARM_ORIGIN}/SiteGlobals/Functions/RSSFeed/DE/Medizinprodukte/Kundeninfo/RSSNewsfeed.xml?nn=597716`
const RESULTS_PER_PAGE = 30
const MAX_PAGES  = 50
const MAX_ITEMS  = 200
const MAX_PAGES_YEAR = 50  // 50 pages × 30 items = 1,500 max per year shortcut
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

export interface ScrapedFsn {
  external_id:  string
  title:        string
  manufacturer: string | null
  product_name: string | null
  fsn_date:     string | null
  source_url:   string
  raw_content:  string
  source_db:    string
}

/** @deprecated use ScrapedFsn */
export type FsnItem = ScrapedFsn

export interface ScraperParams {
  fromDate:     string
  toDate:       string
  searchTerms?: string[]   // pre-computed tokens from buildManufacturerSearchTerms
  profile?: {
    manufacturer: string
    device_name:  string
  }
}

// Returned by every public scraper function.
// Non-empty warnings → the caller should mark the run as 'degraded'.
export interface ScraperResult {
  items:                 ScrapedFsn[]
  warnings:              string[]
  archiveLimitationHit?: boolean   // true when results are empty due to a known archive limit, not a scraper error
}

interface ScraperOptions {
  fromDate?: Date
  toDate?: Date
}

// Keys are German month names, values are 0-based month indices.
const GERMAN_MONTHS: Record<string, number> = {
  Januar: 0, Februar: 1, März: 2, April: 3,
  Mai: 4, Juni: 5, Juli: 6, August: 7,
  September: 8, Oktober: 9, November: 10, Dezember: 11,
}

function formatBfarmDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

// BfArM results are sorted newest-first; include date params on every page so
// the server can at least hint at the range (even if server-side filtering is
// unreliable, it reduces pages returned).  We always filter client-side too.
function buildUrl(page: number, fromDate?: Date, toDate?: Date): string {
  let url = `${SEARCH_BASE}?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=${RESULTS_PER_PAGE}`
  if (fromDate) url += `&input_Datum_VON=${formatBfarmDate(fromDate)}`
  if (toDate)   url += `&input_Datum_BIS=${formatBfarmDate(toDate)}`
  // %3D is the URL-encoded "=" required by BfArM's pagination parameter.
  if (page > 1) url += `&gtp=469344_list%3D${page}`
  return url
}

function parseGermanDate(block: string): Date | null {
  const m = block.match(/c-icon-teaser__date[\s\S]*?(\d{1,2})\.\s+(\w+)\s+(\d{4})/)
  if (!m) return null
  const month = GERMAN_MONTHS[m[2]]
  if (month === undefined) return null
  // Use Date.UTC to avoid timezone-dependent local-time constructor.
  // new Date(y, m, d) would shift the date by the server's UTC offset, causing
  // off-by-one comparisons against fromDate/toDate which are always UTC midnight.
  return new Date(Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10)))
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export interface ParsedItem {
  href:         string
  title:        string
  date:         Date | null
  externalId:   string
  manufacturer: string | null
}

export function parsePage(html: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const blocks = html.split('<li class="l-teaser-list__item">')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]

    // href always precedes the class attribute on these <a> tags
    const hrefMatch = block.match(/href="(\/SharedDocs\/Kundeninfos[^"]+)"/)
    if (!hrefMatch) continue
    const href = hrefMatch[1]

    const titleMatch = block.match(/class="c-icon-teaser__headline">([\s\S]*?)<\/span>/)
    if (!titleMatch) continue
    const title = stripTags(titleMatch[1])
    if (!title.startsWith('Dringende Sicherheitsinformation')) continue

    const date = parseGermanDate(block)
    const idMatch = href.match(/\/(\d+-\d+)_kundeninfo/)
    const externalId = idMatch ? idMatch[1] : href

    const mfrMatch = title.match(/ von (.+)$/)
    const manufacturer = mfrMatch ? mfrMatch[1].trim() : null

    items.push({ href, title, date, externalId, manufacturer })
  }

  return items
}

export async function scrapeBfArM(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
  const { fromDate, toDate } = options

  try {
    const raw: ScrapedFsn[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildUrl(page, fromDate, toDate)
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching page ${page}`)
      const html = await res.text()

      const pageItems = parsePage(html)

      if (pageItems.length === 0) break

      for (const item of pageItems) {
        if (raw.length >= MAX_ITEMS) break

        raw.push({
          external_id:  item.externalId,
          title:        item.title,
          manufacturer: item.manufacturer,
          product_name: null,
          fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
          source_url:   `${BFARM_ORIGIN}${item.href}`,
          raw_content:  sanitizeContent(item.title),
          source_db:    'bfarm',
        })
      }

      if (raw.length >= MAX_ITEMS || pageItems.length < RESULTS_PER_PAGE) break
    }

    // Belt-and-suspenders: drop items outside the requested date range.
    // Also drops items with no date — we can't verify their relevance.
    const dropped = raw.filter(item => {
      if (!item.fsn_date) return true
      const d = new Date(item.fsn_date)
      if (fromDate && d < fromDate) return true
      if (toDate   && d > toDate)   return true
      return false
    })
    const inRange = raw.filter(item => {
      if (!item.fsn_date) return false
      const d = new Date(item.fsn_date)
      if (fromDate && d < fromDate) return false
      if (toDate   && d > toDate)   return false
      return true
    })
    // De-duplicate by external_id (pagination can return the same FSN twice
    // if result order shifts between page fetches).
    const seen = new Set<string>()
    const deduped = inRange.filter(item => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })
    // If no results in range, return empty — do NOT fall back to RSS.
    // RSS ignores the date filter and would pollute results with out-of-range
    // items. Zero results is a valid state: BfArM does not publish daily.
    if (deduped.length === 0) {
      return []
    }

    return deduped
  } catch (err) {
    console.error('[BfArM] HTML scraper error:', err)
    // Re-throw so the search run is marked as error rather than silently
    // returning stale RSS data that ignores the user's date filter.
    throw err
  }
}

// ─── Year-shortcut mode (for searches > 90 days) ─────────────────────────────

/**
 * Maps a calendar year to its BfArM URL shortcut key.
 * BfArM only exposes archives for the current year and 2 years prior.
 * Returns null for any year outside that window.
 */
export function yearToShortcut(year: number, currentYear: number): string | null {
  if (year === currentYear)     return 'current_year'
  if (year === currentYear - 1) return 'lastyear'
  if (year === currentYear - 2) return 'penultimateyear'
  return null
}

async function scrapeYearShortcut(shortcut: string): Promise<ParsedItem[]> {
  const items: ParsedItem[] = []
  let pageNum = 1

  while (pageNum <= MAX_PAGES_YEAR) {
    const base = `${SEARCH_BASE}?cl2Categories_Format=kundeninfo&dateOfIssue_dt=${shortcut}&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=${RESULTS_PER_PAGE}`
    const url  = pageNum === 1 ? base : `${base}&gtp=469344_list%3D${pageNum}`

    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) {
      console.error('[bfarm]', `${shortcut} page ${pageNum}: HTTP ${res.status}, stopping`)
      break
    }
    const html      = await res.text()
    const pageItems = parsePage(html)

    if (pageItems.length === 0) break
    items.push(...pageItems)
    if (pageItems.length < RESULTS_PER_PAGE) break

    pageNum++
    await new Promise(r => setTimeout(r, 500))
  }

  return items
}

async function scrapeBfarmYearShortcuts(params: { fromDate: string; toDate: string }): Promise<ScraperResult> {
  const fromYear    = new Date(params.fromDate + 'T00:00:00.000Z').getUTCFullYear()
  const toYear      = new Date(params.toDate   + 'T00:00:00.000Z').getUTCFullYear()
  const currentYear = new Date().getUTCFullYear()

  const yearsToScrape: string[] = []
  const warnings: string[]      = []

  for (let year = fromYear; year <= toYear; year++) {
    const shortcut = yearToShortcut(year, currentYear)
    if (shortcut) {
      yearsToScrape.push(shortcut)
    } else {
      const msg =
        `BfArM: year ${year} is outside the 3-year archive window ` +
        `(${currentYear - 2}–${currentYear}). Data for this period is unavailable via automated search.`
      console.error('[bfarm]', msg)
      warnings.push(msg)
    }
  }

  if (yearsToScrape.length === 0) {
    return { items: [], warnings, archiveLimitationHit: true }
  }

  const allParsed: ParsedItem[] = []
  for (const shortcut of yearsToScrape) {
    const yearItems = await scrapeYearShortcut(shortcut)
    allParsed.push(...yearItems)
  }

  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

  const raw: ScrapedFsn[] = allParsed.map(item => ({
    external_id:  item.externalId,
    title:        item.title,
    manufacturer: item.manufacturer,
    product_name: null,
    fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
    source_url:   `${BFARM_ORIGIN}${item.href}`,
    raw_content:  sanitizeContent(item.title),
    source_db:    'bfarm',
  }))

  const inRange = raw.filter(item => {
    if (!item.fsn_date) return false
    const d = new Date(item.fsn_date)
    return d >= fromDate && d <= toDate
  })
  const seen = new Set<string>()
  const deduped = inRange.filter(item => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })
  return { items: deduped, warnings, archiveLimitationHit: warnings.length > 0 }
}

// Public entry point — dispatches to date-range mode (≤90 days) or year-shortcut
// mode (>90 days). Both paths return deduped, date-filtered results.
// Falls back to Firecrawl only when the primary scraper fails unexpectedly.
// Does NOT fall back when 0 items is due to a known archive limitation.
export async function scrapeBfarm(params: ScraperParams): Promise<ScraperResult> {
  const { firecrawlFallback } = await import('./firecrawl')

  const total = daysBetween(params.fromDate, params.toDate)
  const from  = new Date(params.fromDate + 'T00:00:00.000Z')
  const to    = new Date(params.toDate   + 'T23:59:59.999Z')

  let primary: ScraperResult
  try {
    primary = total <= 90
      ? { items: await scrapeBfArM({ fromDate: from, toDate: to }), warnings: [] }
      : await scrapeBfarmYearShortcuts(params)
  } catch (err) {
    primary = { items: [], warnings: [`BfArM primary scraper threw: ${String(err)}`] }
  }

  let result: ScraperResult
  if (primary.items.length > 0 || primary.archiveLimitationHit) {
    result = primary
  } else {
    const fallback = await firecrawlFallback(params)
    // If Firecrawl itself failed (402, timeout, etc.) fall back to primary so
    // a Firecrawl outage never silently discards whatever the regular scraper found.
    result = fallback.items.length > 0
      ? fallback
      : { items: primary.items, warnings: [...primary.warnings, ...fallback.warnings], archiveLimitationHit: primary.archiveLimitationHit }
  }

  if (params.searchTerms && params.searchTerms.length > 0) {
    const terms = params.searchTerms.map(t => t.toLowerCase())
    const before = result.items.length
    const filtered = result.items.filter(item => {
      const hay = `${item.title} ${item.raw_content}`.toLowerCase()
      return terms.some(t => hay.includes(t))
    })
    return { ...result, items: filtered }
  }

  return result
}

// Kept for potential future use (e.g. "latest FSNs" widget that doesn't
// need a date range filter). Not called from the main search pipeline.
export async function scrapeRssFeed(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
  const response = await fetch(RSS_URL)
  if (!response.ok) {
    throw new Error(`BfArM RSS fetch failed: ${response.status} ${response.statusText}`)
  }

  const xml = await response.text()
  const parsed = await parseStringPromise(xml)
  const items: unknown[] = parsed?.rss?.channel?.[0]?.item ?? []
  const results: ScrapedFsn[] = []

  for (const raw of items) {
    const item = raw as Record<string, unknown[]>
    const title       = String(item.title?.[0] ?? '')
    const link        = String(item.link?.[0] ?? '')
    const description = String(item.description?.[0] ?? '')
    const pubDateStr  = String(item.pubDate?.[0] ?? '')

    const guidRaw = item.guid?.[0]
    const external_id =
      typeof guidRaw === 'object' && guidRaw !== null
        ? String((guidRaw as Record<string, unknown>)._ ?? link)
        : String(guidRaw ?? link)

    const itemDate = pubDateStr ? new Date(pubDateStr) : null
    if (itemDate && !isNaN(itemDate.getTime())) {
      if (options.fromDate && itemDate < options.fromDate) continue
      if (options.toDate   && itemDate > options.toDate)   continue
    }

    results.push({
      external_id,
      title,
      manufacturer: extractManufacturer(title) || null,
      product_name: null,
      fsn_date:     itemDate && !isNaN(itemDate.getTime())
        ? itemDate.toISOString().split('T')[0]
        : null,
      source_url:   link,
      raw_content:  sanitizeContent(description),
      source_db:    'bfarm',
    })
  }

  return results
}

function extractManufacturer(title: string): string {
  const match = title.match(/[–\-]\s*([^–\-]+)$/)
  return match ? match[1].trim() : ''
}
