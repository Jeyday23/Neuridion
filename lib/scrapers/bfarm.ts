// BfArM HTML search scraper — paginates through all results
// Replaces the RSS feed approach which was capped at 20 items

const SEARCH_BASE = 'https://www.bfarm.de/SiteGlobals/Forms/Suche/Expertensuche_Formular.html'
const BFARM_ORIGIN = 'https://www.bfarm.de'

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

function formatDateDE(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

function buildUrl(pageNum: number, fromDate?: Date, toDate?: Date): string {
  // Base params: FSN category filter
  let url = `${SEARCH_BASE}?nn=597716&cl2Categories_Format=kundeninfo`

  // Date range — German dd.mm.yyyy format, field names from BfArM's expert search form
  if (fromDate) url += `&input_Datum_VON=${formatDateDE(fromDate)}`
  if (toDate)   url += `&input_Datum_BIS=${formatDateDE(toDate)}`

  // Pagination — the = sign inside the value must be encoded as %3D
  url += `&gtp=597716_list%3D${pageNum}`

  return url
}

interface ParsedItem {
  title:      string
  url:        string
  date:       string | null
  externalId: string
}

function parsePageResults(html: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const seen = new Set<string>()

  // Strategy 1: find <article> blocks (modern BfArM layout)
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi
  let m: RegExpExecArray | null
  while ((m = articleRe.exec(html)) !== null) {
    const item = extractItem(m[1])
    if (item && !seen.has(item.externalId)) {
      seen.add(item.externalId)
      items.push(item)
    }
  }

  // Strategy 2: find <li> entries inside the known list container
  if (items.length === 0) {
    const listContainerRe = /id="597716_list"[^>]*>([\s\S]*?)(?=<\/ul>|<\/ol>)/i
    const listMatch = html.match(listContainerRe)
    const listHtml = listMatch ? listMatch[1] : html
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
    while ((m = liRe.exec(listHtml)) !== null) {
      const item = extractItem(m[1])
      if (item && !seen.has(item.externalId)) {
        seen.add(item.externalId)
        items.push(item)
      }
    }
  }

  // Strategy 3: find all FSN links directly from raw HTML
  if (items.length === 0) {
    const linkRe = /<a[^>]+href="([^"]*(?:Kundeninfo|kundeninfo|FSN|fsn)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    while ((m = linkRe.exec(html)) !== null) {
      const href = m[1].split('?')[0]
      if (seen.has(href)) continue
      seen.add(href)
      const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (!title) continue
      const fullUrl = href.startsWith('http') ? href : `${BFARM_ORIGIN}${href}`
      items.push({ title, url: fullUrl, date: null, externalId: href })
    }
  }

  return items
}

function extractItem(html: string): ParsedItem | null {
  // Find the first meaningful link
  const linkRe = /<a[^>]+href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/i
  const linkMatch = html.match(linkRe)
  if (!linkMatch) return null

  const href = linkMatch[1]
  // Skip pure navigation links (anchors, js:, mailto:, external non-BfArM)
  if (href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto')) return null
  if (href.startsWith('http') && !href.includes('bfarm.de')) return null

  const title = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (!title || title.length < 5) return null

  const fullUrl = href.startsWith('http') ? href : `${BFARM_ORIGIN}${href}`

  // Extract date: prefer <time datetime="..."> then text patterns DD.MM.YYYY
  let date: string | null = null
  const timeMatch = html.match(/<time[^>]+datetime="([^"]+)"/)
  if (timeMatch) {
    const raw = timeMatch[1]
    // datetime could be YYYY-MM-DD or DD.MM.YYYY
    date = raw.match(/^\d{4}-\d{2}-\d{2}$/) ? raw : parseDateDE(raw)
  }
  if (!date) {
    const textDateMatch = html.match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (textDateMatch) {
      date = `${textDateMatch[3]}-${textDateMatch[2]}-${textDateMatch[1]}`
    }
  }

  return { title, url: fullUrl, date, externalId: href.split('?')[0] }
}

function parseDateDE(s: string): string | null {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export async function scrapeBfArM(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
  const MAX_PAGES = 20
  const MAX_ITEMS = 200
  const allItems: ScrapedFsn[] = []
  const seenIds = new Set<string>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = buildUrl(page, options.fromDate, options.toDate)
    let html: string

    try {
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'de-DE,de;q=0.9',
          'User-Agent': 'Mozilla/5.0 (compatible; KodexPMS/1.0)',
        },
      })
      if (!res.ok) {
        console.error(`[BfArM] Page ${page} fetch failed: ${res.status}`)
        break
      }
      html = await res.text()
    } catch (err) {
      console.error(`[BfArM] Page ${page} error:`, err)
      break
    }

    const pageItems = parsePageResults(html)
    console.log(`[BfArM] Page ${page}: found ${pageItems.length} items`)

    if (pageItems.length === 0) {
      console.log(`[BfArM] No items on page ${page}, stopping pagination`)
      break
    }

    let newThisPage = 0
    for (const item of pageItems) {
      if (seenIds.has(item.externalId)) continue
      seenIds.add(item.externalId)
      newThisPage++

      allItems.push({
        external_id:  item.externalId,
        title:        item.title,
        manufacturer: extractManufacturer(item.title) || null,
        product_name: null,
        fsn_date:     item.date,
        source_url:   item.url,
        raw_content:  item.title,
        source_db:    'bfarm',
      })

      if (allItems.length >= MAX_ITEMS) break
    }

    if (allItems.length >= MAX_ITEMS) {
      console.log(`[BfArM] Hit cap of ${MAX_ITEMS} items`)
      break
    }

    // If every item on this page was already seen, we've looped — stop
    if (newThisPage === 0) {
      console.log(`[BfArM] All items on page ${page} were duplicates, stopping`)
      break
    }
  }

  console.log(`[BfArM] Total items fetched: ${allItems.length}`)
  return allItems
}

// BfArM notice titles often follow the pattern "Product Name - Manufacturer"
function extractManufacturer(title: string): string {
  const match = title.match(/[–\-]\s*([^–\-]+)$/)
  return match ? match[1].trim() : ''
}
