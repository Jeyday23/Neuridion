import type { ScrapedFsn } from './bfarm'

// GOV.UK Content API — stable, no auth required
// Docs: https://content-api.publishing.service.gov.uk/
const CONTENT_API = 'https://www.gov.uk/api/content/drug-device-alerts'
const SEARCH_API  = 'https://www.gov.uk/api/search.json'
const PAGE_SIZE   = 100

export async function scrapeMhra(
  fromDate: Date,
  toDate: Date
): Promise<ScrapedFsn[]> {
  const results: ScrapedFsn[] = []
  let start = 0

  while (true) {
    // GOV.UK Search API — filter to medical device alerts only
    const url = new URL(SEARCH_API)
    url.searchParams.set('filter_format', 'medical_safety_alert')
    url.searchParams.set('filter_alert_type', 'Field safety notice')
    url.searchParams.set('count', String(PAGE_SIZE))
    url.searchParams.set('start', String(start))
    url.searchParams.set('order', '-public_timestamp')
    url.searchParams.set('fields[]', 'title')
    url.searchParams.set('fields[]', 'description')
    url.searchParams.set('fields[]', 'link')
    url.searchParams.set('fields[]', 'public_timestamp')
    url.searchParams.set('fields[]', 'organisations')

    const page = await fetchPage(url.toString())
    if (!page?.results?.length) break

    for (const item of page.results) {
      const pubDate = item.public_timestamp
        ? new Date(item.public_timestamp)
        : null

      // Filter by date range
      if (pubDate) {
        if (pubDate < fromDate) {
          // Results are ordered newest first — stop when we go past fromDate
          return dedup(results)
        }
        if (pubDate > toDate) continue
      }

      const link = item.link
        ? `https://www.gov.uk${item.link}`
        : ''

      results.push({
        external_id:  item.link ?? String(start),
        title:        cleanTitle(item.title ?? ''),
        manufacturer: extractManufacturer(item.title ?? '', item.description ?? ''),
        product_name: extractProductName(item.title ?? ''),
        fsn_date:     pubDate
          ? pubDate.toISOString().split('T')[0]
          : null,
        source_url:   link,
        raw_content:  [item.title, item.description].filter(Boolean).join('\n\n'),
        source_db:    'mhra',
      })
    }

    start += PAGE_SIZE

    // Stop if we've fetched all available results
    const total = page.total ?? 0
    if (start >= total || start >= 2000) break

    await sleep(150)
  }

  return dedup(results)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      console.error(`MHRA API error: ${res.status} ${url}`)
      return null
    }
    return res.json()
  } catch (err) {
    console.error('MHRA fetch failed:', err)
    return null
  }
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^Field Safety Notice:\s*/i, '')
    .replace(/^FSN:\s*/i, '')
    .trim()
}

function extractManufacturer(title: string, description: string): string | null {
  // Try "Manufacturer: X" pattern in description first
  const mfrMatch = description.match(/manufacturer[:\s]+([^\n,\.]{3,60})/i)
  if (mfrMatch) return mfrMatch[1].trim()

  // Try "by ManufacturerName" in title
  const byMatch = title.match(/\bby\s+([A-Z][^\n,]{2,50})/i)
  if (byMatch) return byMatch[1].trim()

  // Try "— ManufacturerName" pattern
  const dashIdx = title.indexOf(' — ')
  if (dashIdx > 0) {
    const candidate = title.substring(0, dashIdx).trim()
    if (candidate.length < 80) return candidate
  }

  return null
}

function extractProductName(title: string): string | null {
  const cleaned = cleanTitle(title)

  // After " — " is usually the product
  const dashIdx = cleaned.indexOf(' — ')
  if (dashIdx > 0) return cleaned.substring(dashIdx + 3).trim() || null

  // After ": " is sometimes the product
  const colonIdx = cleaned.indexOf(': ')
  if (colonIdx > 0) return cleaned.substring(colonIdx + 2).trim() || null

  return cleaned || null
}

function dedup(items: ScrapedFsn[]): ScrapedFsn[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
