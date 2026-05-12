import type { ScrapedFsn, ScraperResult, ScraperParams } from './bfarm'
import { sanitizeContent } from './sanitize'

const SEARCH_API      = 'https://www.gov.uk/api/search.json'
const CONTENT_API_BASE = 'https://www.gov.uk/api/content'
const PAGE_SIZE        = 100
const DETAIL_CONCURRENCY = 3
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

export async function scrapeMhra(params: ScraperParams): Promise<ScraperResult> {
  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

  const listings: ScrapedFsn[] = []
  const warnings: string[] = []
  let start = 0

  while (true) {
    const url = new URL(SEARCH_API)
    url.searchParams.set('filter_format', 'medical_safety_alert')
    url.searchParams.set('count',         String(PAGE_SIZE))
    url.searchParams.set('start',             String(start))
    url.searchParams.set('order',             '-public_timestamp')
    url.searchParams.append('fields[]',        'title')
    url.searchParams.append('fields[]',        'description')
    url.searchParams.append('fields[]',        'link')
    url.searchParams.append('fields[]',        'public_timestamp')

    const page = await fetchJson(url.toString()) as GovUkSearchResponse | null

    if (page === null) {
      warnings.push(`MHRA: fetch failed at offset ${start} — results may be incomplete.`)
      break
    }
    if (!page.results?.length) {
      break
    }

    let hitBoundary = false
    for (const item of page.results) {
      const pubDate = item.public_timestamp ? new Date(item.public_timestamp) : null

      if (pubDate && pubDate < fromDate) {
        hitBoundary = true
        break
      }
      if (pubDate && pubDate > toDate) continue

      // GOV.UK mixes medicine recalls with device FSNs — keep only FSN-related entries
      const titleLower = (item.title ?? '').toLowerCase()
      const isFsn = titleLower.includes('field safety') || titleLower.includes('medical device alert') || titleLower.includes('device alert')
      if (!isFsn) continue

      const linkPath = item.link ?? ''
      listings.push({
        external_id:  linkPath || String(start),
        title:        cleanTitle(item.title ?? ''),
        manufacturer: extractManufacturer(item.title ?? '', item.description ?? ''),
        product_name: extractProductName(item.title ?? ''),
        fsn_date:     pubDate ? pubDate.toISOString().slice(0, 10) : null,
        source_url:   linkPath ? `https://www.gov.uk${linkPath}` : '',
        raw_content:  sanitizeContent([item.title, item.description].filter(Boolean).join('\n\n')),
        source_db:    'mhra',
      })
    }

    if (hitBoundary) break

    start += PAGE_SIZE
    const total = page.total ?? 0
    if (start >= 2000 && start < total) {
      warnings.push(`MHRA results capped at 2000 — ${total} total available. Results may be incomplete.`)
    }
    if (start >= total || start >= 2000) break

    await jitter(150, 350)
  }

  const enriched = await enrichWithDetails(listings)
  const deduped  = dedup(enriched)

  if (deduped.length === 0) {
    warnings.push('MHRA returned 0 Field Safety Notices for the selected date range. The GOV.UK search API may be temporarily unavailable or the date range contains no FSNs.')
  }

  if (params.searchTerms && params.searchTerms.length > 0) {
    const terms    = params.searchTerms.map(t => t.toLowerCase())
    const filtered = deduped.filter(item => {
      const hay = `${item.title} ${item.raw_content ?? ''}`.toLowerCase()
      return terms.some(t => hay.includes(t))
    })
    return { items: filtered, warnings }
  }

  return { items: deduped, warnings }
}

// ─── Detail enrichment ────────────────────────────────────────────────────────

async function enrichWithDetails(items: ScrapedFsn[]): Promise<ScrapedFsn[]> {
  const result: ScrapedFsn[] = []

  for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
    const batch   = items.slice(i, i + DETAIL_CONCURRENCY)
    const enriched = await Promise.all(batch.map(enrichItem))
    result.push(...enriched)

    if (i + DETAIL_CONCURRENCY < items.length) {
      await jitter(300, 650)
    }
  }

  return result
}

async function enrichItem(item: ScrapedFsn): Promise<ScrapedFsn> {
  const linkPath = item.source_url.replace('https://www.gov.uk', '')
  if (!linkPath.startsWith('/')) return item

  try {
    const detail = await fetchJson(`${CONTENT_API_BASE}${linkPath}`) as GovUkContentItem | null
    if (!detail) return item

    const body      = detail.details?.body     ?? ''
    const refNumber = detail.details?.ref_number ?? ''
    const issuedDate = detail.details?.issued_date ?? ''

    const rawParts = [
      item.title,
      refNumber  ? `Reference: ${refNumber}` : '',
      body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    ].filter(Boolean)

    return {
      ...item,
      fsn_date:    (issuedDate || item.fsn_date) ?? null,
      raw_content: sanitizeContent(rawParts.join('\n\n')),
    }
  } catch (err) {
    console.error('[mhra]', `Detail fetch failed for ${linkPath}:`, err)
    return item
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) {
      console.error(`[mhra] HTTP ${res.status} ${url}`)
      return null
    }
    return res.json()
  } catch (err) {
    console.error(`[mhra] Fetch failed: ${url}:`, err)
    return null
  }
}

const jitter = (minMs: number, maxMs: number) =>
  new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs)))

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function cleanTitle(raw: string): string {
  return raw.replace(/^Field Safety (Notice|Alert)[:\s]*/i, '').replace(/^FSN:\s*/i, '').trim()
}

function extractManufacturer(title: string, description: string): string | null {
  const mfrMatch = description.match(/manufacturer[:\s]+([^\n,\.]{3,60})/i)
  if (mfrMatch) return mfrMatch[1].trim()

  const byMatch = title.match(/\bby\s+([A-Z][^\n,]{2,50})/i)
  if (byMatch) return byMatch[1].trim()

  const dashIdx = title.indexOf(' — ')
  if (dashIdx > 0) {
    const candidate = title.substring(0, dashIdx).trim()
    if (candidate.length < 80) return candidate
  }

  return null
}

function extractProductName(title: string): string | null {
  const cleaned = cleanTitle(title)
  const dashIdx = cleaned.indexOf(' — ')
  if (dashIdx > 0) return cleaned.substring(dashIdx + 3).trim() || null
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface GovUkSearchResponse {
  results?: GovUkSearchItem[]
  total?:   number
}

interface GovUkSearchItem {
  title?:            string
  description?:      string
  link?:             string
  public_timestamp?: string
}

interface GovUkContentItem {
  details?: {
    body?:         string
    ref_number?:   string
    issued_date?:  string
    alert_type?:   string
  }
}
