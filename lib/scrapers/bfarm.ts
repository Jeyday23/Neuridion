import { parseStringPromise } from 'xml2js'

const FEED_URL =
  'https://www.bfarm.de/SiteGlobals/Functions/RSSFeed/DE/Kundeninfos/RSSNewsfeed_Kundeninfos_MP.xml'

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

export async function scrapeBfArM(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
  const response = await fetch(FEED_URL)
  if (!response.ok) {
    throw new Error(`BfArM feed fetch failed: ${response.status} ${response.statusText}`)
  }

  const xml = await response.text()
  const parsed = await parseStringPromise(xml)

  const items: unknown[] = parsed?.rss?.channel?.[0]?.item ?? []
  const results: ScrapedFsn[] = []

  for (const raw of items) {
    const item = raw as Record<string, unknown[]>

    const title = String(item.title?.[0] ?? '')
    const link = String(item.link?.[0] ?? '')
    const description = String(item.description?.[0] ?? '')
    const pubDateStr = String(item.pubDate?.[0] ?? '')

    // guid can be a plain string or an object with attributes
    const guidRaw = item.guid?.[0]
    const external_id =
      typeof guidRaw === 'object' && guidRaw !== null
        ? String((guidRaw as Record<string, unknown>)._ ?? link)
        : String(guidRaw ?? link)

    // Parse and filter by date
    const itemDate = pubDateStr ? new Date(pubDateStr) : null
    if (itemDate && !isNaN(itemDate.getTime())) {
      if (options.fromDate && itemDate < options.fromDate) continue
      if (options.toDate && itemDate > options.toDate) continue
    }

    results.push({
      external_id,
      title,
      manufacturer:  extractManufacturer(title) || null,
      product_name:  null,
      fsn_date:      itemDate && !isNaN(itemDate.getTime())
        ? itemDate.toISOString().split('T')[0]
        : null,
      source_url:    link,
      raw_content:   description,
      source_db:     'bfarm',
    })
  }

  return results
}

// BfArM notice titles often follow the pattern "Product Name - Manufacturer"
// or use an em-dash. This is a best-effort extraction.
function extractManufacturer(title: string): string {
  const match = title.match(/[–\-]\s*([^–\-]+)$/)
  return match ? match[1].trim() : ''
}
