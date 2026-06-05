import type { ScrapedFsn, ScraperResult, ScraperParams } from './bfarm'
import { chunkDateRange, daysBetween } from '@/lib/utils/date-chunks'
import { sanitizeContent } from './sanitize'
import { fetchWithRetry } from './fetch-with-retry'

const SEARCH_API      = 'https://www.gov.uk/api/search.json'
const CONTENT_API_BASE = 'https://www.gov.uk/api/content'
const PAGE_SIZE        = 100
const DETAIL_CONCURRENCY = 3
const MAX_ITEMS        = 500
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

async function scrapeMhraChunk(fromDate: Date, toDate: Date): Promise<ScraperResult> {
  const listings: ScrapedFsn[] = []
  const warnings: string[] = []
  let start = 0
  let consecutiveOutOfRange = 0

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
    url.searchParams.append('fields[]',        'alert_type')

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
        consecutiveOutOfRange++
        if (consecutiveOutOfRange >= 5) { hitBoundary = true; break }
        continue
      } else {
        consecutiveOutOfRange = 0
      }
      if (pubDate && pubDate > toDate) continue

      const alertTypes = item.alert_type ?? []
      const isDeviceFsn = alertTypes.some(t =>
        t === 'field-safety-notices' || t === 'device-safety-information'
      )
      if (!isDeviceFsn) continue

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
    if (start >= total) break

    await jitter(150, 350)
  }

  const enriched = await enrichWithDetails(listings)
  return { items: enriched, warnings }
}

export async function scrapeMhra(params: ScraperParams): Promise<ScraperResult> {
  const totalDays = daysBetween(params.fromDate, params.toDate)
  const allItems: ScrapedFsn[] = []
  const allWarnings: string[] = []

  if (totalDays <= 180) {
    const result = await scrapeMhraChunk(
      new Date(params.fromDate + 'T00:00:00.000Z'),
      new Date(params.toDate + 'T23:59:59.999Z'),
    )
    allItems.push(...result.items)
    allWarnings.push(...result.warnings)
  } else {
    const chunks = chunkDateRange(params.fromDate, params.toDate, 90)
    for (const chunk of chunks) {
      const result = await scrapeMhraChunk(
        new Date(chunk.from + 'T00:00:00.000Z'),
        new Date(chunk.to + 'T23:59:59.999Z'),
      )
      allItems.push(...result.items)
      allWarnings.push(...result.warnings)
    }
  }

  const deduped = dedup(allItems)

  if (params.searchTerms && params.searchTerms.length > 0) {
    console.warn(`[mhra] searchTerms pre-filter disabled: passing all ${deduped.length} items to AI filter`)
  }

  if (deduped.length > MAX_ITEMS) {
    allWarnings.push(`MHRA: result cap hit — returning ${MAX_ITEMS} of ${deduped.length} items`)
  }

  return { items: deduped.slice(0, MAX_ITEMS), warnings: allWarnings }
}

// ─── Detail enrichment ────────────────────────────────────────────────────────

async function enrichWithDetails(items: ScrapedFsn[]): Promise<ScrapedFsn[]> {
  const result: ScrapedFsn[] = []

  for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
    const batch   = items.slice(i, i + DETAIL_CONCURRENCY)
    const enriched = await Promise.all(batch.map(enrichItem))
    result.push(...enriched.flat())

    if (result.length >= MAX_ITEMS) break

    if (i + DETAIL_CONCURRENCY < items.length) {
      await jitter(300, 650)
    }
  }

  return result
}

async function enrichItem(item: ScrapedFsn): Promise<ScrapedFsn[]> {
  const linkPath = item.source_url.replace('https://www.gov.uk', '')
  if (!linkPath.startsWith('/')) return [item]

  try {
    const detail = await fetchJson(`${CONTENT_API_BASE}${linkPath}`) as GovUkContentItem | null
    if (!detail) return [item]

    const body      = detail.details?.body     ?? ''
    const refNumber = detail.details?.ref_number ?? ''
    const rawIssuedDate = detail.details?.issued_date ?? ''

    const h3Count = (body.match(/<h3[\s>]/g) ?? []).length
    if (!refNumber && h3Count >= 3) {
      const extracted = parseRoundupBody(body, linkPath, item.fsn_date)
      if (extracted.length > 0) return extracted
    }

    let issuedDate: string | null = null
    if (rawIssuedDate) {
      const parsed = new Date(rawIssuedDate)
      if (!isNaN(parsed.getTime())) {
        issuedDate = parsed.toISOString().slice(0, 10)
      }
    }

    const rawParts = [
      item.title,
      refNumber  ? `Reference: ${refNumber}` : '',
      stripHtmlTags(body).replace(/\s+/g, ' ').trim(),
    ].filter(Boolean)

    return [{
      ...item,
      fsn_date:    issuedDate ?? item.fsn_date ?? null,
      raw_content: sanitizeContent(rawParts.join('\n\n')),
    }]
  } catch (err) {
    console.error('[mhra]', `Detail fetch failed for ${linkPath}:`, err instanceof Error ? err.message : String(err))
    return [item]
  }
}

// ─── Roundup page parsing ─────────────────────────────────────────────────────

function parseRoundupBody(html: string, roundupPath: string, fallbackDate: string | null): ScrapedFsn[] {
  const sections = html.split(/<h3[^>]*>/).slice(1)
  const results: ScrapedFsn[] = []

  for (const section of sections) {
    if (results.length >= MAX_ITEMS) break
    const closingIdx = section.indexOf('</h3>')
    if (closingIdx < 0) continue

    const h3Inner = stripHtmlTags(section.slice(0, closingIdx)).trim()
    if (!h3Inner) continue

    const afterH3 = section.slice(closingIdx + 5)

    const manufacturer = extractMfrFromH3(h3Inner)
    const product      = extractProductFromH3(h3Inner)
    const mhraRef      = extractMhraRef(afterH3)
    const fsnDate      = extractDateFromParagraphs(afterH3) ?? fallbackDate
    const model        = extractModel(afterH3)

    const bodyText = stripHtmlTags(afterH3).replace(/\s+/g, ' ').trim()
    const rawParts = [h3Inner, model ? `Model: ${model}` : '', mhraRef ? `MHRA reference: ${mhraRef}` : '', bodyText].filter(Boolean)

    const slug = h3Inner.slice(0, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
    const externalId = mhraRef
      ? `mhra-ref-${mhraRef}`
      : `${roundupPath}#${slug}-${results.length}`

    results.push({
      external_id:  externalId,
      title:        h3Inner,
      manufacturer: manufacturer,
      product_name: product,
      fsn_date:     fsnDate,
      source_url:   `https://www.gov.uk${roundupPath}`,
      raw_content:  sanitizeContent(rawParts.join('\n\n')),
      source_db:    'mhra',
    })
  }

  return results
}

function extractMfrFromH3(h3: string): string | null {
  const colonIdx = h3.indexOf(': ')
  if (colonIdx > 0) return h3.slice(0, colonIdx).trim() || null
  return null
}

function extractProductFromH3(h3: string): string | null {
  const colonIdx = h3.indexOf(': ')
  if (colonIdx > 0) return h3.slice(colonIdx + 2).trim() || null
  return h3 || null
}

function extractMhraRef(html: string): string | null {
  const match = html.match(/MHRA reference:.*?(\d{7,10})/i)
  return match ? match[1] : null
}

function extractDateFromParagraphs(html: string): string | null {
  const paragraphs = html.match(/<p>(.*?)<\/p>/gi) ?? []
  for (const p of paragraphs.slice(0, 3)) {
    const text = stripHtmlTags(p).trim()
    const dateMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4})/)
    if (dateMatch) {
      const parsed = new Date(dateMatch[1])
      if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
    }
    if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.test(text)) {
      const parsed = new Date(text.match(/\w+\s+\d{4}/)?.[0] ?? '')
      if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
    }
  }
  return null
}

function extractModel(html: string): string | null {
  const match = html.match(/<p>\s*Model:\s*(.*?)<\/p>/i)
  if (match) return stripHtmlTags(match[1]).trim() || null
  return null
}

function stripHtmlTags(html: string): string {
  let result = ''
  let inTag = false
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<') { inTag = true; continue }
    if (html[i] === '>') { inTag = false; result += ' '; continue }
    if (!inTag) result += html[i]
  }
  return result
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })

    if (!res.ok) {
      console.error(`[mhra] HTTP ${res.status} ${url}`)
      return null
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('json')) {
      console.error(`[mhra] Unexpected content type from ${url}: ${contentType}`)
      return null
    }
    const text = await res.text()
    if (text.length > 5 * 1024 * 1024) {
      console.error(`[mhra] Response too large from ${url}: ${text.length} bytes`)
      return null
    }
    return JSON.parse(text)
  } catch (err) {
    console.error(`[mhra] Fetch failed: ${url}: ${err instanceof Error ? err.message : String(err)}`)
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
  alert_type?:       string[]
}

interface GovUkContentItem {
  title?:   string
  details?: {
    body?:         string
    ref_number?:   string
    issued_date?:  string
    alert_type?:   string
  }
}
