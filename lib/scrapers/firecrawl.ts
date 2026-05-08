import type { ScraperParams, ScraperResult, ScrapedFsn } from './bfarm'
import { parsePage, BFARM_ORIGIN } from './bfarm'

const FIRECRAWL_API    = 'https://api.firecrawl.dev/v1'
const POLL_INTERVAL_MS = 5_000
const POLL_MAX_ATTEMPTS = 24   // 24 × 5s = 120s timeout
const CRAWL_PAGE_LIMIT  = 60   // 60 pages × 30 items = 1,800 max (matches bfarm.ts MAX_PAGES)

function toBfarmDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export async function firecrawlFallback(params: ScraperParams): Promise<ScraperResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return { items: [], warnings: ['FIRECRAWL_API_KEY not set — BfArM fallback unavailable'] }
  }

  const seedUrl =
    `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html` +
    `?cl2Categories_Format=kundeninfo` +
    `&cl2Categories_Rubrik=medizinprodukte` +
    `&resultsPerPage=30` +
    `&input_Datum_VON=${toBfarmDate(params.fromDate)}` +
    `&input_Datum_BIS=${toBfarmDate(params.toDate)}`

  // Start the crawl job
  let crawlId: string
  try {
    const startRes = await fetch(`${FIRECRAWL_API}/crawl`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url:               seedUrl,
        limit:             CRAWL_PAGE_LIMIT,
        allowExternalLinks: false,
        includePaths:      ['/SiteGlobals/Forms/Suche/Expertensuche_Formular.html'],
        scrapeOptions:     { formats: ['html'] },
      }),
    })

    if (startRes.status === 402) {
      console.error('[bfarm]', 'Firecrawl fallback skipped: no credits')
      return { items: [], warnings: ['Firecrawl fallback skipped: no credits (HTTP 402)'] }
    }
    if (startRes.status === 401 || startRes.status === 403) {
      return { items: [], warnings: [`Firecrawl auth failed: ${startRes.status}`] }
    }
    if (!startRes.ok) {
      const body = await startRes.text().catch(() => '')
      return { items: [], warnings: [`Firecrawl crawl start failed: HTTP ${startRes.status} — ${body.slice(0, 200)}`] }
    }

    const startData = await startRes.json() as { id?: string }
    if (!startData.id) {
      return { items: [], warnings: ['Firecrawl returned no crawl ID'] }
    }
    crawlId = startData.id
  } catch (err) {
    return { items: [], warnings: [`Firecrawl request failed: ${String(err)}`] }
  }

  // Poll until completed or timeout
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    let pollData: FirecrawlStatus
    try {
      const pollRes = await fetch(`${FIRECRAWL_API}/crawl/${crawlId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!pollRes.ok) {
        return { items: [], warnings: [`Firecrawl poll failed: HTTP ${pollRes.status}`] }
      }
      pollData = await pollRes.json() as FirecrawlStatus
    } catch (err) {
      return { items: [], warnings: [`Firecrawl poll request failed: ${String(err)}`] }
    }

    if (pollData.status === 'failed') {
      return { items: [], warnings: ['Firecrawl crawl job failed'] }
    }
    if (pollData.status !== 'completed') continue

    // Parse each crawled page's HTML using the existing BfArM parser
    const allParsed = (pollData.data ?? []).flatMap(page =>
      page.html ? parsePage(page.html) : []
    )

    const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
    const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

    const inRange: ScrapedFsn[] = allParsed
      .filter(item => item.date && item.date >= fromDate && item.date <= toDate)
      .map(item => ({
        external_id:  item.externalId,
        title:        item.title,
        manufacturer: item.manufacturer,
        product_name: null,
        fsn_date:     item.date ? item.date.toISOString().split('T')[0] : null,
        source_url:   `${BFARM_ORIGIN}${item.href}`,
        raw_content:  item.title,
        source_db:    'bfarm',
      }))

    const seen    = new Set<string>()
    const deduped = inRange.filter(item => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })

    return {
      items:    deduped,
      warnings: ['BfArM primary scraper returned empty — results via Firecrawl fallback'],
    }
  }

  return { items: [], warnings: ['Firecrawl crawl timed out after 120s'] }
}

interface FirecrawlStatus {
  status: 'scraping' | 'completed' | 'failed' | string
  data?:  Array<{ url?: string; html?: string }>
}
