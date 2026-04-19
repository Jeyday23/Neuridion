import { parseStringPromise } from 'xml2js'

const BFARM_ORIGIN = 'https://www.bfarm.de'
const SEARCH_BASE  = `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html`
const RSS_URL      = `${BFARM_ORIGIN}/SiteGlobals/Functions/RSSFeed/DE/Medizinprodukte/Kundeninfo/RSSNewsfeed.xml?nn=597716`
const RESULTS_PER_PAGE = 30
const MAX_PAGES  = 50
const MAX_ITEMS  = 200
const UA = 'Mozilla/5.0 (compatible; KodexMedical/1.0)'

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

// Note: BfArM's date params (input_Datum_VON / input_Datum_BIS) are ignored
// server-side — results always sort newest-first. We filter dates client-side
// and stop as soon as an item falls before fromDate.
function buildUrl(page: number): string {
  let url = `${SEARCH_BASE}?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=${RESULTS_PER_PAGE}`
  // %3D is the URL-encoded "=" required by BfArM's pagination parameter.
  // Using string concatenation (not URLSearchParams) to avoid double-encoding.
  if (page > 1) url += `&gtp=469344_list%3D${page}`
  return url
}

function parseGermanDate(block: string): Date | null {
  const m = block.match(/c-icon-teaser__date[\s\S]*?(\d{1,2})\.\s+(\w+)\s+(\d{4})/)
  if (!m) return null
  const month = GERMAN_MONTHS[m[2]]
  if (month === undefined) return null
  return new Date(parseInt(m[3], 10), month, parseInt(m[1], 10))
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

interface ParsedItem {
  href:         string
  title:        string
  date:         Date | null
  externalId:   string
  manufacturer: string | null
}

function parsePage(html: string): ParsedItem[] {
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
    const results: ScrapedFsn[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildUrl(page)
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching page ${page}`)
      const html = await res.text()

      const pageItems = parsePage(html)
      console.log(`[BfArM] Page ${page}: found ${pageItems.length} items`)

      if (pageItems.length === 0) break

      let stop = false
      for (const item of pageItems) {
        if (item.date && toDate   && item.date > toDate)   continue  // not yet in range
        if (item.date && fromDate && item.date < fromDate) { stop = true; break }  // passed range

        if (results.length >= MAX_ITEMS) { stop = true; break }

        results.push({
          external_id:  item.externalId,
          title:        item.title,
          manufacturer: item.manufacturer,
          product_name: null,
          fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
          source_url:   `${BFARM_ORIGIN}${item.href}`,
          raw_content:  item.title,
          source_db:    'bfarm',
        })
      }

      if (stop || pageItems.length < RESULTS_PER_PAGE) break
    }

    console.log(`[BfArM] Total items fetched: ${results.length}`)

    if (results.length === 0) {
      console.log('[BfArM] HTML scraper returned 0 results, falling back to RSS')
      return scrapeRss(options)
    }

    return results
  } catch (err) {
    console.error('[BfArM] HTML scraper error, falling back to RSS:', err)
    return scrapeRss(options)
  }
}

async function scrapeRss(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
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
    const title      = String(item.title?.[0] ?? '')
    const link       = String(item.link?.[0] ?? '')
    const description = String(item.description?.[0] ?? '')
    const pubDateStr = String(item.pubDate?.[0] ?? '')

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
      raw_content:  description,
      source_db:    'bfarm',
    })
  }

  return results
}

function extractManufacturer(title: string): string {
  const match = title.match(/[–\-]\s*([^–\-]+)$/)
  return match ? match[1].trim() : ''
}
