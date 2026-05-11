import type { ScraperParams, ScraperResult } from '@/lib/scrapers/bfarm'
import { sendScraperHealthAlert, type ScraperHealthResult } from '@/lib/email'
import { safeCompare } from '@/lib/utils/auth'

const TIMEOUT_MS = 30_000

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    )
    promise
      .then((val) => {
        clearTimeout(timer)
        resolve(val)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

async function checkScraper(
  name: string,
  run: () => Promise<ScraperResult>,
): Promise<ScraperHealthResult> {
  const start = Date.now()
  try {
    const result = await withTimeout(run(), TIMEOUT_MS, name)
    const durationMs = Date.now() - start
    const hasWarnings = result.warnings.length > 0
    const healthy = result.items.length > 0 && !hasWarnings

    return {
      source: name,
      healthy,
      itemCount: result.items.length,
      warnings: hasWarnings ? result.warnings : undefined,
      durationMs,
    }
  } catch (err) {
    return {
      source: name,
      healthy: false,
      itemCount: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-worker-secret')
  const expected = process.env.WORKER_API_SECRET
  if (!secret || !expected || !safeCompare(secret, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const toDate = formatDate(now)
  const fromDate = formatDate(sevenDaysAgo)

  const params: ScraperParams = { fromDate, toDate }

  const results = await Promise.all([
    checkScraper('bfarm', async () => {
      const { scrapeBfarm } = await import('@/lib/scrapers/bfarm')
      return scrapeBfarm(params)
    }),
    checkScraper('fda', async () => {
      const { scrapeFdaMaude } = await import('@/lib/scrapers/fda-maude')
      return scrapeFdaMaude({ fromDate, toDate })
    }),
    checkScraper('mhra', async () => {
      const { scrapeMhra } = await import('@/lib/scrapers/mhra')
      return scrapeMhra(params)
    }),
    checkScraper('swissmedic', async () => {
      const { scrapeSwissmedic } = await import('@/lib/scrapers/swissmedic')
      return scrapeSwissmedic(params)
    }),
  ])

  const degradedCount = results.filter((r) => !r.healthy).length

  if (degradedCount > 0) {
    try {
      await sendScraperHealthAlert(results)
    } catch (emailErr) {
      console.error(
        '[scraper-health] Failed to send alert email:',
        emailErr instanceof Error ? emailErr.message : emailErr,
      )
    }
  }

  return Response.json({
    checked_at: now.toISOString(),
    period: { from: fromDate, to: toDate },
    healthy: degradedCount === 0,
    degraded_count: degradedCount,
    results,
  })
}
