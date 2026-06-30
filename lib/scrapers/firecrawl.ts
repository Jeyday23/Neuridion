import { scraperResult, type ScraperParams, type ScraperResult, type ScrapedFsn } from './bfarm'
import { parseNextPageHref, parsePage, BFARM_ORIGIN, yearToShortcut } from './bfarm'
import { sanitizeContent } from './sanitize'

const FIRECRAWL_API    = 'https://api.firecrawl.dev/v1'
const POLL_INTERVAL_MS = 5_000
const CRAWL_PAGE_LIMIT  = 5
const SCRAPE_PAGE_LIMIT = 50
const FIRECRAWL_REQUEST_TIMEOUT_MS = 15_000
const BFARM_LONG_RANGE_ARCHIVE_DAYS = 181

function toBfarmDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function fetchWithDeadline(url: string, init: RequestInit, deadlineMs: number): Promise<Response> {
  const controller = new AbortController()
  const remaining = deadlineMs - Date.now()
  const timeoutMs = Math.min(Math.max(remaining, 0), FIRECRAWL_REQUEST_TIMEOUT_MS)

  if (remaining <= 0) {
    return Promise.reject(new Error('Firecrawl budget exhausted'))
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const parentSignal = init.signal
  const abort = () => controller.abort()

  if (parentSignal?.aborted) {
    clearTimeout(timeout)
    controller.abort()
  } else {
    parentSignal?.addEventListener('abort', abort, { once: true })
  }

  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abort)
    })
}

function seedBfarmUrl(params: ScraperParams): string {
  return bfarmPageUrl(params, 1)
}

function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso + 'T00:00:00.000Z')
  const toMs = Date.parse(toIso + 'T00:00:00.000Z')
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0
  return Math.floor((toMs - fromMs) / 86_400_000) + 1
}

function bfarmPageUrl(params: ScraperParams, page: number): string {
  return `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html` +
    `?cl2Categories_Format=kundeninfo` +
    `&cl2Categories_Rubrik=medizinprodukte` +
    `&resultsPerPage=30` +
    `&input_Datum_VON=${toBfarmDate(params.fromDate)}` +
    `&input_Datum_BIS=${toBfarmDate(params.toDate)}` +
    `&submit=Senden` +
    (page > 1 ? `&gtp=469344_list%253D${page}` : '')
}

function bfarmArchivePageUrl(shortcut: string, page: number): string {
  return `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html` +
    `?cl2Categories_Format=kundeninfo` +
    `&dateOfIssue_dt=${shortcut}` +
    `&cl2Categories_Rubrik=medizinprodukte` +
    `&resultsPerPage=30` +
    (page > 1 ? `&gtp=469344_list%253D${page}` : '')
}

async function firecrawlScrapeHtml(
  apiKey: string,
  pageUrl: string,
  deadlineMs: number,
  parentSignal?: AbortSignal,
): Promise<{ html?: string; status: 'ok' | 'failed'; warning?: string }> {
  let response: Response
  try {
    response = await fetchWithDeadline(`${FIRECRAWL_API}/scrape`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: parentSignal,
      body: JSON.stringify({
        url:     pageUrl,
        formats: ['html'],
      }),
    }, deadlineMs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'failed', warning: `Firecrawl scrape request failed: ${msg}` }
  }

  if (response.status === 402) {
    return { status: 'failed', warning: 'Firecrawl fallback skipped: no credits (HTTP 402)' }
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 'failed', warning: `Firecrawl auth failed: ${response.status}` }
  }
  if (!response.ok) {
    return { status: 'failed', warning: `Firecrawl scrape failed: HTTP ${response.status}` }
  }

  const data = await response.json().catch(() => null) as null | {
    data?: { html?: string }
    html?: string
  }
  const html = data?.data?.html ?? data?.html
  if (!html) {
    return { status: 'failed', warning: 'Firecrawl scrape returned no HTML' }
  }

  return { status: 'ok', html }
}

async function firecrawlSequentialBfarmPageSet(
  params: ScraperParams,
  options: { apiKey: string; deadlineMs: number; signal?: AbortSignal },
  pageUrlForPage: (page: number) => string,
): Promise<ScraperResult | null> {
  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')
  const warnings: string[] = []
  const seenPageUrls = new Set<string>()
  const seenPageSignatures = new Set<string>()
  const allParsed: ReturnType<typeof parsePage> = []

  let pageUrl: string | null = pageUrlForPage(1)

  for (let page = 1; page <= SCRAPE_PAGE_LIMIT && pageUrl; page++) {
    if (options.signal?.aborted) {
      return scraperResult([], ['Firecrawl sequential BfArM pagination aborted'], { failed: true })
    }
    if (Date.now() + FIRECRAWL_REQUEST_TIMEOUT_MS >= options.deadlineMs) {
      warnings.push(`BfArM fallback pagination stopped at page ${page}: budget exhausted`)
      break
    }
    if (seenPageUrls.has(pageUrl)) {
      warnings.push(`BfArM fallback pagination loop detected at page ${page}`)
      break
    }
    seenPageUrls.add(pageUrl)

    const scraped = await firecrawlScrapeHtml(options.apiKey, pageUrl, options.deadlineMs, options.signal)
    if (scraped.status !== 'ok' || !scraped.html) {
      warnings.push(scraped.warning ?? `BfArM fallback pagination failed at page ${page}`)
      break
    }

    const pageItems = parsePage(scraped.html)
    if (pageItems.length === 0) {
      warnings.push(`BfArM fallback pagination stopped at page ${page}: no parseable result rows`)
      break
    }

    const pageSignature = pageItems.map(item => item.externalId).join('\u0000')
    if (seenPageSignatures.has(pageSignature)) {
      warnings.push(`BfArM fallback pagination stopped at page ${page}: repeated result page detected; source coverage is incomplete.`)
      break
    }
    seenPageSignatures.add(pageSignature)

    allParsed.push(...pageItems)

    const datedItems = pageItems.filter(
      (item): item is ReturnType<typeof parsePage>[number] & { date: Date } => item.date !== null,
    )
    const crossedBelowFromDate = datedItems.some(item => item.date < fromDate)
    const nextHref = parseNextPageHref(scraped.html)
    if (crossedBelowFromDate) {
      const coverage = toScrapedCoverage(allParsed, fromDate, toDate)
      return scraperResult(coverage.items, warnings)
    }
    if (!nextHref) {
      if (pageItems.length < 30) {
        const coverage = toScrapedCoverage(allParsed, fromDate, toDate)
        return scraperResult(coverage.items, warnings)
      }
      pageUrl = pageUrlForPage(page + 1)
      continue
    }

    pageUrl = new URL(nextHref, BFARM_ORIGIN).toString()
  }

  if (allParsed.length === 0) return null

  const coverage = toScrapedCoverage(allParsed, fromDate, toDate)
  if (coverage.items.length === 0) return null
  return scraperResult(coverage.items, [
    ...warnings,
    'BfArM fallback returned items but could not prove complete date-range pagination coverage',
  ])
}

async function firecrawlSequentialBfarmArchivePages(
  params: ScraperParams,
  options: { apiKey: string; deadlineMs: number; signal?: AbortSignal },
): Promise<ScraperResult | null> {
  const fromYear    = new Date(params.fromDate + 'T00:00:00.000Z').getUTCFullYear()
  const toYear      = new Date(params.toDate   + 'T00:00:00.000Z').getUTCFullYear()
  const currentYear = new Date().getUTCFullYear()
  const shortcuts: string[] = []
  const warnings: string[] = []

  for (let year = fromYear; year <= toYear; year++) {
    const shortcut = yearToShortcut(year, currentYear)
    if (shortcut) {
      shortcuts.push(shortcut)
    } else {
      warnings.push(
        `BfArM: year ${year} is outside the 3-year archive window ` +
        `(${currentYear - 2}–${currentYear}). Data for this period is unavailable via automated search.`,
      )
    }
  }

  if (shortcuts.length === 0) {
    return scraperResult([], warnings, { archiveLimitationHit: true })
  }

  const byId = new Map<string, ScrapedFsn>()

  for (const shortcut of shortcuts) {
    const result = await firecrawlSequentialBfarmPageSet(
      params,
      options,
      (page) => bfarmArchivePageUrl(shortcut, page),
    )
    if (!result) {
      warnings.push(`BfArM Firecrawl ${shortcut} archive returned no parseable items`)
      continue
    }
    warnings.push(...result.warnings)
    for (const item of result.items) byId.set(item.external_id, item)
  }

  if (byId.size === 0 && warnings.length === 0) return null
  return scraperResult([...byId.values()], [...new Set(warnings)])
}

async function firecrawlSequentialBfarmPages(
  params: ScraperParams,
  options: { apiKey: string; deadlineMs: number; signal?: AbortSignal },
): Promise<ScraperResult | null> {
  const totalDays = daysBetweenInclusive(params.fromDate, params.toDate)
  if (totalDays >= BFARM_LONG_RANGE_ARCHIVE_DAYS) {
    const archiveResult = await firecrawlSequentialBfarmArchivePages(params, options)
    if (!archiveResult || archiveResult.items.length > 0 || archiveResult.outcome === 'complete') {
      return archiveResult
    }

    const exactDateResult = await firecrawlSequentialBfarmPageSet(
      params,
      options,
      (page) => bfarmPageUrl(params, page),
    )
    if (exactDateResult && exactDateResult.items.length > archiveResult.items.length) {
      return scraperResult(exactDateResult.items, [
        ...archiveResult.warnings,
        'BfArM archive Firecrawl fallback returned 0 items; used exact-date Firecrawl fallback instead.',
        ...exactDateResult.warnings,
      ])
    }

    return archiveResult
  }

  return firecrawlSequentialBfarmPageSet(
    params,
    options,
    (page) => bfarmPageUrl(params, page),
  )
}

export async function firecrawlFallback(
  params: ScraperParams,
  options?: { deadlineMs?: number; signal?: AbortSignal },
): Promise<ScraperResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return scraperResult([], ['FIRECRAWL_API_KEY not set — BfArM fallback unavailable'], { failed: true })
  }

  const deadlineMs = options?.deadlineMs ?? (Date.now() + 120_000)
  const parentSignal = options?.signal

  console.error(`[firecrawl] fallback started with ${Math.round((deadlineMs - Date.now()) / 1000)}s remaining`)

  const sequential = await firecrawlSequentialBfarmPages(params, { apiKey, deadlineMs, signal: parentSignal })
  let sequentialZeroWarnings: string[] = []
  if (sequential) {
    console.error(`[firecrawl] sequential fallback returned ${sequential.items.length} items (outcome=${sequential.outcome})`)
    if (sequential.items.length > 0 || sequential.outcome === 'complete' || sequential.outcome === 'failed') {
      return sequential
    }
    sequentialZeroWarnings = [
      ...sequential.warnings,
      'BfArM sequential Firecrawl fallback returned 0 items; used crawl fallback instead.',
    ]
    console.error('[firecrawl] sequential fallback returned 0 partial items; trying crawl fallback before giving up')
  }

  const seedUrl = seedBfarmUrl(params)

  let crawlId: string
  try {
    const startRes = await fetchWithDeadline(`${FIRECRAWL_API}/crawl`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: parentSignal,
      body: JSON.stringify({
        url:               seedUrl,
        limit:             CRAWL_PAGE_LIMIT,
        allowExternalLinks: false,
        includePaths:      ['/SiteGlobals/Forms/Suche/Expertensuche_Formular.html'],
        scrapeOptions:     { formats: ['html'] },
      }),
    }, deadlineMs)

    if (startRes.status === 402) {
      console.error('[firecrawl] fallback skipped: no credits')
      return scraperResult([], ['Firecrawl fallback skipped: no credits (HTTP 402)'], { failed: true })
    }
    if (startRes.status === 401 || startRes.status === 403) {
      return scraperResult([], [`Firecrawl auth failed: ${startRes.status}`], { failed: true })
    }
    if (!startRes.ok) {
      const body = await startRes.text().catch(() => '')
      const safeBody = body.slice(0, 200)
        .replace(/(?:sk-|fc-|Bearer\s+)[A-Za-z0-9_-]+/g, '[REDACTED]')
        .replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
      console.error(`[firecrawl] crawl start failed: HTTP ${startRes.status} — ${safeBody}`)
      return scraperResult([], [`Firecrawl crawl start failed (HTTP ${startRes.status})`], { failed: true })
    }

    const startData = await startRes.json() as { id?: string }
    if (!startData.id) {
      return scraperResult([], ['Firecrawl returned no crawl ID'], { failed: true })
    }
    crawlId = startData.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[firecrawl] start request failed: ${msg}`)
    return scraperResult([], [`Firecrawl request failed: ${msg}`], { failed: true })
  }

  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')
  const startMs  = Date.now()
  let lastPageCount = 0
  let bestPartialData: FirecrawlStatus['data'] = []

  while (Date.now() + POLL_INTERVAL_MS < deadlineMs) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    if (parentSignal?.aborted) {
      return scraperResult([], ['Firecrawl polling aborted'], { failed: true })
    }

    let pollData: FirecrawlStatus
    try {
      const pollRes = await fetchWithDeadline(`${FIRECRAWL_API}/crawl/${crawlId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: parentSignal,
      }, deadlineMs)
      if (!pollRes.ok) {
        return scraperResult([], [`Firecrawl poll failed: HTTP ${pollRes.status}`], { failed: true })
      }
      pollData = await pollRes.json() as FirecrawlStatus
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[firecrawl] poll failed: ${msg}`)
      break
    }

    const pageCount = pollData.data?.length ?? 0
    if (pageCount !== lastPageCount) {
      console.error(`[firecrawl] poll: status=${pollData.status} pages=${pageCount} (${Math.round((Date.now() - startMs) / 1000)}s)`)
      lastPageCount = pageCount
    }

    if (pageCount > 0) {
      bestPartialData = pollData.data ?? []
    }

    if (pollData.status === 'failed') {
      console.error('[firecrawl] crawl job failed')
      break
    }
    if (pollData.status === 'completed') {
      break
    }
  }

  const coverage = extractCoverage(bestPartialData, fromDate, toDate)
  const items = coverage.items
  const elapsed = Math.round((Date.now() - startMs) / 1000)

  if (items.length > 0) {
    console.error(`[firecrawl] returning ${items.length} items from ${bestPartialData.length} pages (${elapsed}s)`)
    if (coverage.coverageComplete) {
      console.error('[firecrawl] fallback coverage complete for requested BfArM date range')
      return scraperResult(items, sequentialZeroWarnings)
    }
    return scraperResult(items, [...sequentialZeroWarnings, 'BfArM fallback returned items but could not prove complete date-range coverage'])
  }

  if (bestPartialData.length === 0) {
    console.error(`[firecrawl] 0 pages crawled after ${elapsed}s — bfarm.de may be blocking Firecrawl IPs`)
    return scraperResult([], [`Firecrawl returned 0 pages after ${elapsed}s — bfarm.de may be unreachable from cloud`], { failed: true })
  }

  console.error(`[firecrawl] ${bestPartialData.length} pages crawled but 0 parseable items (${elapsed}s)`)
  return scraperResult([], [`Firecrawl crawled ${bestPartialData.length} pages but 0 items matched the date range`])
}

function extractCoverage(
  pages: Array<{ url?: string; html?: string }>,
  fromDate: Date,
  toDate: Date,
): { items: ScrapedFsn[]; coverageComplete: boolean } {
  const allParsed = pages.flatMap(page =>
    page.html ? parsePage(page.html) : []
  )

  const coverage = toScrapedCoverage(allParsed, fromDate, toDate)
  const crossedBelowFromDate = allParsed.some(item => item.date !== null && item.date < fromDate)

  return {
    items: coverage.items,
    coverageComplete: crossedBelowFromDate,
  }
}

function toScrapedCoverage(
  allParsed: ReturnType<typeof parsePage>,
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

interface FirecrawlStatus {
  status: 'scraping' | 'completed' | 'failed' | string
  data?:  Array<{ url?: string; html?: string }>
}
