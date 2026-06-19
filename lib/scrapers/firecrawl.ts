import { scraperResult, type ScraperParams, type ScraperResult, type ScrapedFsn } from './bfarm'
import { parsePage, BFARM_ORIGIN } from './bfarm'
import { sanitizeContent } from './sanitize'

const FIRECRAWL_API    = 'https://api.firecrawl.dev/v1'
const POLL_INTERVAL_MS = 5_000
const CRAWL_PAGE_LIMIT  = 5
const FIRECRAWL_REQUEST_TIMEOUT_MS = 15_000

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

  const seedUrl =
    `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html` +
    `?cl2Categories_Format=kundeninfo` +
    `&cl2Categories_Rubrik=medizinprodukte` +
    `&resultsPerPage=30` +
    `&input_Datum_VON=${toBfarmDate(params.fromDate)}` +
    `&input_Datum_BIS=${toBfarmDate(params.toDate)}`

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

  const items = extractItems(bestPartialData, fromDate, toDate)
  const elapsed = Math.round((Date.now() - startMs) / 1000)

  if (items.length > 0) {
    console.error(`[firecrawl] returning ${items.length} items from ${bestPartialData.length} pages (${elapsed}s)`)
    return scraperResult(items, ['BfArM primary scraper returned empty — results via Firecrawl fallback'])
  }

  if (bestPartialData.length === 0) {
    console.error(`[firecrawl] 0 pages crawled after ${elapsed}s — bfarm.de may be blocking Firecrawl IPs`)
    return scraperResult([], [`Firecrawl returned 0 pages after ${elapsed}s — bfarm.de may be unreachable from cloud`], { failed: true })
  }

  console.error(`[firecrawl] ${bestPartialData.length} pages crawled but 0 parseable items (${elapsed}s)`)
  return scraperResult([], [`Firecrawl crawled ${bestPartialData.length} pages but 0 items matched the date range`])
}

function extractItems(
  pages: Array<{ url?: string; html?: string }>,
  fromDate: Date,
  toDate: Date,
): ScrapedFsn[] {
  const allParsed = pages.flatMap(page =>
    page.html ? parsePage(page.html) : []
  )

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
  return inRange.filter(item => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })
}

interface FirecrawlStatus {
  status: 'scraping' | 'completed' | 'failed' | string
  data?:  Array<{ url?: string; html?: string }>
}
