import { scraperResult, type ScrapedFsn, type ScraperResult, type ScraperParams } from './bfarm'
import { chunkDateRange, daysBetween } from '@/lib/utils/date-chunks'
import { sanitizeContent } from './sanitize'
import { fetchWithRetry } from './fetch-with-retry'

const SEARCH_API      = 'https://www.gov.uk/api/search.json'
const CONTENT_API_BASE = 'https://www.gov.uk/api/content'
const PAGE_SIZE        = 100
const DETAIL_CONCURRENCY = 3
const MAX_ITEMS        = 500
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

async function scrapeMhraChunk(fromDate: Date, toDate: Date, signal?: AbortSignal): Promise<ScraperResult> {
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

    const page = await fetchJson(url.toString(), signal) as GovUkSearchResponse | null

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

  const enriched = await enrichWithDetails(listings, signal)
  return scraperResult(enriched, warnings)
}

export async function scrapeMhra(params: ScraperParams): Promise<ScraperResult> {
  const totalDays = daysBetween(params.fromDate, params.toDate)
  const allItems: ScrapedFsn[] = []
  const allWarnings: string[] = []

  if (totalDays <= 180) {
    const result = await scrapeMhraChunk(
      new Date(params.fromDate + 'T00:00:00.000Z'),
      new Date(params.toDate + 'T23:59:59.999Z'),
      params.signal,
    )
    allItems.push(...result.items)
    allWarnings.push(...result.warnings)
  } else {
    const chunks = chunkDateRange(params.fromDate, params.toDate, 90)
    for (const chunk of chunks) {
      const result = await scrapeMhraChunk(
        new Date(chunk.from + 'T00:00:00.000Z'),
        new Date(chunk.to + 'T23:59:59.999Z'),
        params.signal,
      )
      allItems.push(...result.items)
      allWarnings.push(...result.warnings)
    }
  }

  // Detail enrichment may replace the listing publication date with the
  // regulator's issued date. Re-apply the requested range after enrichment so
  // the returned evidence cannot drift outside the user's search window.
  const deduped = dedup(allItems).filter(item => {
    if (!item.fsn_date) return false
    return item.fsn_date >= params.fromDate && item.fsn_date <= params.toDate
  })

  if (deduped.length > MAX_ITEMS) {
    allWarnings.push(`MHRA: result cap hit — returning ${MAX_ITEMS} of ${deduped.length} items`)
  }

  return scraperResult(deduped.slice(0, MAX_ITEMS), allWarnings)
}

// ─── Detail enrichment ────────────────────────────────────────────────────────

async function enrichWithDetails(items: ScrapedFsn[], signal?: AbortSignal): Promise<ScrapedFsn[]> {
  const result: ScrapedFsn[] = []

  for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
    const batch   = items.slice(i, i + DETAIL_CONCURRENCY)
    const enriched = await Promise.all(batch.map(item => enrichItem(item, signal)))
    result.push(...enriched.flat())

    if (result.length >= MAX_ITEMS) break

    if (i + DETAIL_CONCURRENCY < items.length) {
      await jitter(300, 650)
    }
  }

  return result
}

async function enrichItem(item: ScrapedFsn, signal?: AbortSignal): Promise<ScrapedFsn[]> {
  const linkPath = item.source_url.replace('https://www.gov.uk', '')
  if (!linkPath.startsWith('/')) return [item]

  try {
    const detail = await fetchJson(`${CONTENT_API_BASE}${linkPath}`, signal) as GovUkContentItem | null
    if (!detail) return [item]

    const body      = detail.details?.body     ?? ''
    const refNumber = detail.details?.ref_number ?? ''
    const rawIssuedDate = detail.details?.issued_date ?? ''
    const attachmentUrls = extractGovUkAttachmentUrls(detail)

    const originalTitle = detail.title ?? item.title
    if (isMhraRoundupPage(originalTitle, linkPath, body, refNumber)) {
      const sections = splitRoundupSections(body, linkPath, item.fsn_date)
      if (sections.length > 0) return sections
      return [{
        ...item,
        title: cleanMhraRoundupTitle(originalTitle),
        raw_content: sanitizeContent(stripHtmlTags(body).replace(/\s+/g, ' ').trim()),
      }]
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
      attachmentUrls.length > 0 ? `Attachments:\n${attachmentUrls.join('\n')}` : '',
    ].filter(Boolean)

    return [{
      ...item,
      title:        cleanTitle(originalTitle),
      manufacturer: item.manufacturer
        ?? extractManufacturerFromDetail(originalTitle, body)
        ?? 'Not specified by MHRA',
      product_name: item.product_name ?? extractProductName(originalTitle),
      fsn_date:    issuedDate ?? item.fsn_date ?? null,
      raw_content: sanitizeContent(rawParts.join('\n\n')),
    }]
  } catch (err) {
    console.error('[mhra]', `Detail fetch failed for ${linkPath}:`, err instanceof Error ? err.message : String(err))
    return [item]
  }
}

export function extractManufacturerFromDetail(title: string, bodyHtml: string): string | null {
  const text = stripHtmlTags(bodyHtml).replace(/\s+/g, ' ').trim()
  const company = String.raw`[A-Z][A-Za-z0-9&'’.,()/-]*(?:\s+[A-Z][A-Za-z0-9&'’.,()/-]*){0,7}`
  const suffix = String.raw`(?:Inc\.?|Incorporated|Ltd\.?|Limited|GmbH|AG|S\.?A\.?|Corporation|Corp\.?|LLC|plc)`
  const patterns = [
    new RegExp(`\\b(${company}\\s+${suffix})\\s+(?:have|has|are|is|at)\\b`),
    new RegExp(`\\b(?:return(?:ed)?\\s+to|report\\s+details[^.]{0,80}?\\s+to)\\s+(${company}\\s+${suffix})\\b`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].replace(/[.,;:]+$/, '').trim()
  }

  return extractManufacturer(title, '') || null
}

export function extractGovUkAttachmentUrls(detail: GovUkContentItem): string[] {
  const candidates = detail.details?.attachments ?? []
  const urls = candidates.flatMap(attachment => [attachment.url, attachment.web_url])

  return [...new Set(urls.flatMap(raw => {
    if (!raw) return []
    try {
      const parsed = new URL(raw, 'https://www.gov.uk')
      if (parsed.protocol !== 'https:') return []
      if (parsed.hostname !== 'www.gov.uk' && parsed.hostname !== 'assets.publishing.service.gov.uk') return []
      return [parsed.toString()]
    } catch {
      return []
    }
  }))]
}

// ─── Roundup page parsing ─────────────────────────────────────────────────────

const MHRA_DATE_RANGE = /\b\d{1,2}\s+(?:[A-Za-z]+\s+)?to\s+\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?\b/i

const STRUCTURAL_HEADINGS = /^(?:problem|action|advice(?:\s+for\s+.+)?|background|summary|description|details|overview|introduction|conclusion|update|further information|related):?$/i

export function isMhraRoundupPage(
  title: string,
  url: string,
  _body: string,
  refNumber: string,
): boolean {
  if (refNumber.trim()) return false
  if (/field safety notices/i.test(title) && MHRA_DATE_RANGE.test(title)) return true
  if (/\/field-safety-notices--?\d/i.test(url)) return true
  if (MHRA_DATE_RANGE.test(title)) return true
  return false
}

export function cleanMhraRoundupTitle(raw: string): string {
  const dateMatch = raw.match(MHRA_DATE_RANGE)
  if (dateMatch) return `Field Safety Notices: ${dateMatch[0]}`
  return raw.trim()
}

export function splitRoundupSections(
  html: string,
  roundupPath: string,
  fallbackDate: string | null,
): ScrapedFsn[] {
  const parts = html.split(/<h[234][^>]*>/).slice(1)
  const results: ScrapedFsn[] = []

  for (const section of parts) {
    if (results.length >= MAX_ITEMS) break

    const closingMatch = section.match(/<\/h[234]>/)
    if (!closingMatch || closingMatch.index === undefined) continue

    const headingText = stripHtmlTags(section.slice(0, closingMatch.index)).trim()
    if (!headingText) continue
    if (STRUCTURAL_HEADINGS.test(headingText)) continue

    const afterHeading = section.slice(closingMatch.index + closingMatch[0].length)

    const manufacturer = extractMfrFromHeading(headingText)
    const product = extractProductFromHeading(headingText)
    const mhraRef = extractMhraRef(afterHeading)
    const fsnDate = extractDateFromParagraphs(afterHeading) ?? fallbackDate
    const fsnLink = extractFirstGovUkNoticePath(afterHeading)

    if (!isValidRoundupSection(headingText, afterHeading, mhraRef, fsnLink)) continue

    const bodyText = stripHtmlTags(afterHeading).replace(/\s+/g, ' ').trim()
    const rawParts = [
      headingText,
      mhraRef ? `MHRA reference: ${mhraRef}` : '',
      bodyText,
    ].filter(Boolean)

    const slug = headingText.slice(0, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
    const externalId = mhraRef
      ? `mhra-ref-${mhraRef}`
      : fsnLink
        ? `mhra-${fsnLink.replace(/[^a-z0-9]+/gi, '-')}`
        : `${roundupPath}#${slug}-${results.length}`

    results.push({
      external_id: externalId,
      title: headingText,
      manufacturer,
      product_name: product,
      fsn_date: fsnDate,
      source_url: fsnLink ? `https://www.gov.uk${fsnLink}` : `https://www.gov.uk${roundupPath}`,
      raw_content: sanitizeContent(rawParts.join('\n\n')),
      source_db: 'mhra',
    })
  }

  return results
}

export function isValidRoundupSection(
  headingText: string,
  bodyHtml: string,
  mhraRef: string | null,
  fsnLink: string | null,
): boolean {
  if (mhraRef) return true
  if (fsnLink) return true

  let signals = 0
  const combined = `${headingText} ${stripHtmlTags(bodyHtml)}`.toLowerCase()

  if (extractMfrFromHeading(headingText)) signals++
  if (/\b(?:field safety|corrective action|safety notice|recall|withdrawal)\b/i.test(combined)) signals++
  if (/\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(combined)) signals++
  if (/\b(?:device|implant|pump|catheter|stent|scanner|monitor|ventilator|defibrillator|pacemaker)\b/i.test(combined)) signals++

  return signals >= 2
}

function extractMfrFromHeading(heading: string): string | null {
  const colonIdx = heading.indexOf(': ')
  if (colonIdx > 0) return heading.slice(0, colonIdx).trim() || null
  const dashIdx = heading.indexOf(' – ')
  if (dashIdx > 0) return heading.slice(0, dashIdx).trim() || null
  return null
}

function extractProductFromHeading(heading: string): string | null {
  const colonIdx = heading.indexOf(': ')
  if (colonIdx > 0) return heading.slice(colonIdx + 2).trim() || null
  const dashIdx = heading.indexOf(' – ')
  if (dashIdx > 0) return heading.slice(dashIdx + 3).trim() || null
  return heading || null
}

function extractFirstGovUkNoticePath(html: string): string | null {
  const match = html.match(/href="(\/drug-device-alerts\/[^"]+)"/i)
  return match ? match[1] : null
}

function extractMhraRef(html: string): string | null {
  const formalReference = html.match(/\b20\d{2}\/\d{3}\/\d{3}\/\d{3}\/\d{3}\b/)
  if (formalReference) return formalReference[0]
  const match = html.match(/MHRA reference:.*?(\d{7,10})/i)
  return match ? match[1] : null
}

function extractDateFromParagraphs(html: string): string | null {
  const paragraphs = html.match(/<p>(.*?)<\/p>/gi) ?? []
  for (const p of paragraphs.slice(0, 3)) {
    const text = stripHtmlTags(p).trim()
    const parsed = parseEnglishCalendarDate(text)
    if (parsed) return parsed
  }
  return null
}

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

function parseEnglishCalendarDate(text: string): string | null {
  const full = text.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i)
  if (full) {
    const month = ENGLISH_MONTHS[full[2].toLowerCase()]
    const day = Number(full[1])
    const year = Number(full[3])
    const parsed = new Date(Date.UTC(year, month, day))
    if (day >= 1 && day <= 31
      && parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month
      && parsed.getUTCDate() === day) {
      return parsed.toISOString().slice(0, 10)
    }
  }

  const monthYear = text.match(/^\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i)
  if (monthYear) {
    const month = ENGLISH_MONTHS[monthYear[1].toLowerCase()]
    return new Date(Date.UTC(Number(monthYear[2]), month, 1)).toISOString().slice(0, 10)
  }
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

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal,
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
    if (signal?.aborted) throw (signal.reason ?? err)
    console.error(`[mhra] Fetch failed: ${url}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

const jitter = (minMs: number, maxMs: number) =>
  new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs)))

// ─── Parsing helpers ──────────────────────────────────────────────────────────

export function cleanTitle(raw: string): string {
  return raw.replace(/^Field Safety (?:Notice|Alert)\b(?!s)[:\s]*/i, '').replace(/^FSN:\s*/i, '').trim()
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
  description?: string
  details?: {
    body?:         string
    ref_number?:   string
    issued_date?:  string
    alert_type?:   string
    attachments?:  Array<{
      url?:      string
      web_url?:  string
    }>
  }
}
