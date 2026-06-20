import { createHash } from 'crypto'
import { parseStringPromise } from 'xml2js'
import { daysBetween } from '@/lib/utils/date-chunks'
import { sanitizeContent } from './sanitize'

export const BFARM_ORIGIN = 'https://www.bfarm.de'
const SEARCH_BASE  = `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html`
const RSS_URL      = `${BFARM_ORIGIN}/SiteGlobals/Functions/RSSFeed/DE/Medizinprodukte/Kundeninfo/RSSNewsfeed.xml?nn=597716`
const RESULTS_PER_PAGE = 30
const MAX_PAGES  = 50
const MAX_ITEMS  = 500
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
  signal?:      AbortSignal
  searchTerms?: string[]   // pre-computed tokens from buildManufacturerSearchTerms
  profile?: {
    manufacturer: string
    device_name:  string
  }
}

export type ScraperOutcome = 'complete' | 'empty' | 'partial' | 'failed'

// Returned by every public scraper function.
// `outcome` is the machine-readable completeness contract. Coverage and health
// decisions must never be inferred from item count alone.
export interface ScraperResult {
  items:                 ScrapedFsn[]
  warnings:              string[]
  outcome:               ScraperOutcome
  archiveLimitationHit?: boolean   // true when results are empty due to a known archive limit, not a scraper error
  diagnostics?: {
    mhraParityDelta?: number
    channelItemCounts?: Record<string, number>
    bfarmRssOutcome?: ScraperOutcome
    bfarmOutageSuspected?: boolean
  }
}

export function scraperResult(
  items: ScrapedFsn[],
  warnings: string[] = [],
  options: {
    failed?: boolean
    archiveLimitationHit?: boolean
    diagnostics?: ScraperResult['diagnostics']
  } = {},
): ScraperResult {
  const outcome: ScraperOutcome = options.failed
    ? 'failed'
    : warnings.length > 0 || options.archiveLimitationHit
      ? 'partial'
      : items.length > 0
        ? 'complete'
        : 'empty'

  return {
    items,
    warnings,
    outcome,
    ...(options.archiveLimitationHit !== undefined
      ? { archiveLimitationHit: options.archiveLimitationHit }
      : {}),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  }
}

interface ScraperOptions {
  fromDate?: Date
  toDate?: Date
  signal?: AbortSignal
  query?: string
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
function buildUrl(page: number, fromDate?: Date, toDate?: Date, query?: string): string {
  let url = `${SEARCH_BASE}?cl2Categories_Format=kundeninfo&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=${RESULTS_PER_PAGE}`
  if (fromDate) url += `&input_Datum_VON=${formatBfarmDate(fromDate)}`
  if (toDate)   url += `&input_Datum_BIS=${formatBfarmDate(toDate)}`
  if (query) url += `&submit=Senden&templateQueryString=${encodeURIComponent(query)}`
  // %3D is the URL-encoded "=" required by BfArM's pagination parameter.
  if (page > 1) url += `&gtp=469344_list%3D${page}`
  return url
}

function parseGermanDate(block: string): Date | null {
  const numeric = block.match(/c-icon-teaser__date[\s\S]*?(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (numeric) {
    return new Date(Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1])))
  }
  const m = block.match(/c-icon-teaser__date[\s\S]*?(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß&;]+)\s+(\d{4})/)
  if (!m) return null
  const monthName = m[2]
    .replace(/&auml;/gi, 'ä')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&Uuml;/g, 'Ü')
  const month = GERMAN_MONTHS[monthName]
  if (month === undefined) return null
  // Use Date.UTC to avoid timezone-dependent local-time constructor.
  // new Date(y, m, d) would shift the date by the server's UTC offset, causing
  // off-by-one comparisons against fromDate/toDate which are always UTC midnight.
  return new Date(Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10)))
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
}

function classPattern(className: string): string {
  return `(?=[^"']*\\b${className}\\b)[^"']*`
}

function elementTextByClass(block: string, className: string): string | null {
  const match = block.match(new RegExp(
    `<([a-z][a-z0-9:-]*)\\b[^>]*class=["']${classPattern(className)}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i',
  ))
  return match ? stripTags(match[2]) : null
}

function hrefByClass(block: string, className: string): string | null {
  const anchors = block.match(/<a\b[^>]*>/gi) ?? []
  for (const anchor of anchors) {
    const classMatch = anchor.match(/class=["']([^"']*)["']/i)
    if (!classMatch?.[1].split(/\s+/).includes(className)) continue
    const hrefMatch = anchor.match(/href=["']([^"']+)["']/i)
    if (hrefMatch) return decodeHtml(hrefMatch[1])
  }
  return null
}

function absoluteBfarmUrl(href: string): string {
  try {
    return new URL(href, BFARM_ORIGIN).toString()
  } catch {
    return href
  }
}

function getBfarmPrimaryTimeoutMs(): number {
  const raw = Number(process.env.BFARM_PRIMARY_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000
}

function getBfarmSourceBudgetMs(): number {
  const raw = Number(process.env.BFARM_SOURCE_BUDGET_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 170_000
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()

  if (signal?.aborted) {
    clearTimeout(timeout)
    controller.abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }

  return fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal })
    .finally(() => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    })
}

async function withPrimaryBudget<T>(fn: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal): Promise<T> {
  const timeoutMs = getBfarmPrimaryTimeoutMs()
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) controller.abort(parentSignal.reason)
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })

  try {
    return await fn(controller.signal)
  } catch (err) {
    if (timedOut && isAbortError(err)) {
      throw new Error(`BfArM primary scraper timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

export async function fetchBfarmDetail(sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(sourceUrl, 30_000)
    if (!res.ok) return null
    const html = await res.text()

    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      ?? html.match(/class="c-content-stage"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
    if (!mainMatch) return null

    const text = stripTags(mainMatch[1])
    if (text.length < 20) return null
    return text.slice(0, 8000)
  } catch {
    return null
  }
}

export interface ParsedItem {
  href:         string
  title:        string
  date:         Date | null
  externalId:   string
  reference:    string | null
  manufacturer: string | null
  productName:  string | null
}

export function parsePage(html: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const starts = [...html.matchAll(/<(?:li|div)\b[^>]*class=["'][^"']*\bl-teaser-list__item\b[^"']*["'][^>]*>/gi)]

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index ?? 0
    const end = starts[i + 1]?.index ?? html.length
    const block = html.slice(start, end)

    const href = hrefByClass(block, 'c-icon-teaser__link--download')
      ?? decodeHtml(block.match(/href=["']([^"']*\/SharedDocs\/Kundeninfos[^"']+)["']/i)?.[1] ?? '')
    if (!href) continue

    const title = elementTextByClass(block, 'c-icon-teaser__headline')
    if (!title) continue
    const date = parseGermanDate(block)
    const referenceText = elementTextByClass(block, 'c-icon-teaser__reference') ?? block
    const referenceMatch = stripTags(referenceText).match(/\b(\d{4,6})\s*\/\s*(\d{2})\b/)
      ?? href.match(/\/(\d{4,6})-(\d{2})_kundeninfo/i)
    const reference = referenceMatch ? `${referenceMatch[1]}/${referenceMatch[2]}` : null
    const externalId = reference
      ? reference.replace('/', '-')
      : createHash('sha256').update(href).digest('hex').slice(0, 16)

    const mfrMatch = title.match(/\s+von\s+(.+)$/i)
    const manufacturer = mfrMatch ? mfrMatch[1].trim() : null
    const productMatch = title.match(/Sicherheitsinformation\s+zu\s+(.+?)\s+von\s+/i)
    const productName = productMatch ? productMatch[1].trim() : null

    items.push({ href, title, date, externalId, reference, manufacturer, productName })
  }

  return items
}

export function parseNextPageHref(html: string): string | null {
  const containers = html.match(/<(?:li|div)\b[^>]*class=["'][^"']*["'][^>]*>[\s\S]*?<\/(?:li|div)>/gi) ?? []
  for (const container of containers) {
    const classes = container.match(/^<[^>]*class=["']([^"']*)["']/i)?.[1].split(/\s+/) ?? []
    if (!classes.includes('c-navindex__item') || !classes.includes('is-forward')) continue
    const href = container.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]
    if (href) return decodeHtml(href)
  }
  return null
}

export async function scrapeBfArM(options: ScraperOptions = {}): Promise<ScraperResult> {
  const { fromDate, toDate, signal, query } = options
  const warnings: string[] = []

  try {
    const raw: ScrapedFsn[] = []

    let url: string | null = buildUrl(1, fromDate, toDate, query)
    const visited = new Set<string>()
    for (let page = 1; page <= MAX_PAGES && url; page++) {
      if (visited.has(url)) {
        warnings.push(`BfArM: pagination loop detected on page ${page}`)
        break
      }
      visited.add(url)
      const res = await fetchWithTimeout(url, 30_000, signal)
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching page ${page}`)

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('text/html')) {
        warnings.push(`BfArM: unexpected content type on page ${page}: ${contentType}`)
        return scraperResult([], warnings)
      }
      const html = await res.text()
      if (html.length > 5 * 1024 * 1024) {
        warnings.push(`BfArM: response too large on page ${page}: ${html.length} bytes`)
        return scraperResult([], warnings)
      }

      const pageItems = parsePage(html)
      const nextHref = parseNextPageHref(html)

      if (pageItems.length === 0) break
      const pageDates = pageItems
        .map((item) => item.date)
        .filter((date): date is Date => date !== null)
      const crossedBelowFromDate = Boolean(
        fromDate
        && pageDates.length > 0
        && pageDates.some((date) => date < fromDate),
      )

      for (const item of pageItems) {
        if (raw.length >= MAX_ITEMS) break

        raw.push({
          external_id:  item.externalId,
          title:        item.title,
          manufacturer: item.manufacturer,
          product_name: item.productName,
          fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
          source_url:   absoluteBfarmUrl(item.href),
          raw_content:  sanitizeContent([
            item.title,
            item.reference ? `BfArM reference: ${item.reference}` : '',
            absoluteBfarmUrl(item.href),
          ].filter(Boolean).join('\n')),
          source_db:    'bfarm',
        })
      }

      if (raw.length >= MAX_ITEMS || crossedBelowFromDate || !nextHref) break
      url = absoluteBfarmUrl(nextHref)
    }

    if (raw.length >= MAX_ITEMS) {
      warnings.push(`BfArM: result set capped at ${MAX_ITEMS} items — additional FSNs may exist for this date range.`)
    }

    // Belt-and-suspenders: drop items outside the requested date range.
    // Also drops items with no date — we can't verify their relevance.
    const noDateCount = raw.filter(item => !item.fsn_date).length
    if (noDateCount > 0) {
      warnings.push(`${noDateCount} item(s) dropped — date could not be parsed from BfArM HTML`)
    }
    if (raw.length > 0 && noDateCount > raw.length / 2) {
      warnings.push(`BfArM HTML structure may have changed — ${noDateCount}/${raw.length} items lacked parseable dates`)
    }
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
      return scraperResult([], warnings)
    }

    return scraperResult(deduped, warnings)
  } catch (err) {
    console.error('[BfArM] HTML scraper error:', err instanceof Error ? err.message : String(err))
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

async function scrapeYearShortcut(shortcut: string, signal?: AbortSignal): Promise<ParsedItem[]> {
  const items: ParsedItem[] = []
  let pageNum = 1
  let url: string | null = `${SEARCH_BASE}?cl2Categories_Format=kundeninfo&dateOfIssue_dt=${shortcut}&cl2Categories_Rubrik=medizinprodukte&resultsPerPage=${RESULTS_PER_PAGE}`
  const visited = new Set<string>()

  while (pageNum <= MAX_PAGES_YEAR && url) {
    if (visited.has(url)) break
    visited.add(url)
    const res = await fetchWithTimeout(url, 30_000, signal)
    if (!res.ok) {
      console.error('[bfarm]', `${shortcut} page ${pageNum}: HTTP ${res.status}, stopping`)
      break
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      console.error('[bfarm]', `${shortcut} page ${pageNum}: unexpected content type: ${contentType}, stopping`)
      break
    }
    const html = await res.text()
    if (html.length > 5 * 1024 * 1024) {
      console.error('[bfarm]', `${shortcut} page ${pageNum}: response too large (${html.length} bytes), stopping`)
      break
    }

    const pageItems = parsePage(html)
    const nextHref = parseNextPageHref(html)

    if (pageItems.length === 0) break
    items.push(...pageItems)
    if (!nextHref) break

    pageNum++
    url = absoluteBfarmUrl(nextHref)
    await new Promise(r => setTimeout(r, 200))
  }

  return items
}

async function scrapeBfarmYearShortcuts(params: { fromDate: string; toDate: string }, signal?: AbortSignal): Promise<ScraperResult> {
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
    return scraperResult([], warnings, { archiveLimitationHit: true })
  }

  const allParsed: ParsedItem[] = []
  const yearResults = await Promise.all(yearsToScrape.map(async (shortcut) => {
    return scrapeYearShortcut(shortcut, signal)
  }))
  for (const items of yearResults) allParsed.push(...items)

  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

  const raw: ScrapedFsn[] = allParsed.map(item => ({
    external_id:  item.externalId,
    title:        item.title,
    manufacturer: item.manufacturer,
    product_name: item.productName,
    fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
    source_url:   absoluteBfarmUrl(item.href),
    raw_content:  sanitizeContent([
      item.title,
      item.reference ? `BfArM reference: ${item.reference}` : '',
      absoluteBfarmUrl(item.href),
    ].filter(Boolean).join('\n')),
    source_db:    'bfarm',
  }))

  const noDateCount = raw.filter(item => !item.fsn_date).length
  if (noDateCount > 0) {
    warnings.push(`${noDateCount} item(s) dropped — date could not be parsed from BfArM HTML`)
  }
  if (raw.length > 0 && noDateCount > raw.length / 2) {
    warnings.push(`BfArM HTML structure may have changed — ${noDateCount}/${raw.length} items lacked parseable dates`)
  }
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
  return scraperResult(deduped, warnings, { archiveLimitationHit: warnings.length > 0 })
}

export async function scrapeBfarm(params: ScraperParams): Promise<ScraperResult> {
  const { firecrawlFallback } = await import('./firecrawl')

  const sourceBudgetMs = getBfarmSourceBudgetMs()
  const sourceDeadline = Date.now() + sourceBudgetMs

  const total = daysBetween(params.fromDate, params.toDate)
  const from  = new Date(params.fromDate + 'T00:00:00.000Z')
  const to    = new Date(params.toDate   + 'T23:59:59.999Z')

  console.error(`[bfarm] primary started (budget=${getBfarmPrimaryTimeoutMs()}ms, source_budget=${sourceBudgetMs}ms)`)

  let primary: ScraperResult
  const primaryStart = Date.now()
  try {
    primary = await withPrimaryBudget(async (signal) => {
      if (total > 90) return scrapeBfarmYearShortcuts(params, signal)

      const targetedQuery = params.profile?.device_name?.trim()
        || params.profile?.manufacturer?.trim()
        || ''
      if (!targetedQuery) return scrapeBfArM({ fromDate: from, toDate: to, signal })

      // Broad discovery protects recall; the targeted query protects against
      // category/indexing gaps. Neither is trusted for date accuracy.
      const searches = await Promise.allSettled([
        scrapeBfArM({ fromDate: from, toDate: to, signal }),
        scrapeBfArM({ fromDate: from, toDate: to, signal, query: targetedQuery }),
      ])
      const successful = searches
        .filter((result): result is PromiseFulfilledResult<ScraperResult> => result.status === 'fulfilled')
        .map(result => result.value)
      const warnings = successful.flatMap(result => result.warnings)
      searches.forEach((result, index) => {
        if (result.status === 'rejected') {
          warnings.push(`BfArM ${index === 0 ? 'broad' : 'targeted'} discovery failed: ${String(result.reason)}`)
        }
      })
      if (successful.length === 0) throw searches[0].status === 'rejected' ? searches[0].reason : new Error('BfArM discovery failed')

      const byId = new Map<string, ScrapedFsn>()
      for (const result of successful) {
        for (const item of result.items) byId.set(item.external_id, item)
      }
      return scraperResult([...byId.values()], [...new Set(warnings)], {
        failed: successful.every(result => result.outcome === 'failed'),
      })
    }, params.signal)
  } catch (err) {
    const elapsed = Date.now() - primaryStart
    console.error(`[bfarm] primary timed out after ${elapsed}ms`)
    primary = scraperResult([], [`BfArM primary scraper threw: ${String(err)}`], { failed: true })
  }

  if (primary.items.length > 0 || primary.archiveLimitationHit) {
    const elapsed = Date.now() - primaryStart
    console.error(`[bfarm] primary succeeded in ${elapsed}ms — ${primary.items.length} items`)
    return primary
  }

  const remainingMs = sourceDeadline - Date.now()
  if (remainingMs < 10_000) {
    console.error(`[bfarm] skipping Firecrawl fallback — only ${Math.round(remainingMs / 1000)}s remaining`)
    return scraperResult(primary.items, [...primary.warnings, 'BfArM Firecrawl fallback skipped: insufficient budget remaining'], { failed: primary.outcome === 'failed' })
  }

  console.error(`[bfarm] Firecrawl fallback started with ${Math.round(remainingMs / 1000)}s remaining`)
  const fallback = await firecrawlFallback(params, { deadlineMs: sourceDeadline, signal: params.signal })

  if (fallback.items.length > 0) {
    console.error(`[bfarm] Firecrawl fallback returned ${fallback.items.length} items`)
    return fallback
  }

  console.error(`[bfarm] Firecrawl fallback returned 0 items`)
  return scraperResult(
    primary.items,
    [...primary.warnings, ...fallback.warnings],
    { failed: primary.outcome === 'failed' && fallback.outcome === 'failed', archiveLimitationHit: primary.archiveLimitationHit },
  )
}

// Kept for potential future use (e.g. "latest FSNs" widget that doesn't
// need a date range filter). Not called from the main search pipeline.
export async function scrapeRssFeed(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  const abortFromParent = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) controller.abort(options.signal.reason)
  else options.signal?.addEventListener('abort', abortFromParent, { once: true })
  let response: Response
  try {
    response = await fetch(RSS_URL, { headers: { 'User-Agent': UA }, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromParent)
  }
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
