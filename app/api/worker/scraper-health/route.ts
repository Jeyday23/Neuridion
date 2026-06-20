import type { ScraperParams, ScraperResult } from '@/lib/scrapers/bfarm'
import { PRODUCTION_SCRAPERS, type ProductionSourceId } from '@/lib/scrapers/registry'
import { sendScraperHealthAlert, type ScraperHealthResult } from '@/lib/email'
import { safeCompare } from '@/lib/utils/auth'
import { SOURCE_AUTHORITY } from '@/lib/evidence/source-authority'

const TIMEOUT_MS = 30_000

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        controller.abort(new Error(`${label} timed out after ${ms}ms`))
        reject(new Error(`${label} timed out after ${ms}ms`))
      },
      ms,
    )
    run(controller.signal)
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

export function assessScraperResult(
  source: ProductionSourceId,
  result: ScraperResult,
  durationMs: number,
): ScraperHealthResult {
  const contract = SOURCE_AUTHORITY[source]
  const hasWarnings = result.warnings.length > 0
  const parityDelta = result.diagnostics?.mhraParityDelta ?? null
  const parityThreshold = contract.parityWarningThreshold
  const parityDegraded = parityThreshold != null && parityDelta != null && parityDelta > parityThreshold
  return {
    source,
    healthy: (result.outcome === 'complete' || result.outcome === 'empty') && !parityDegraded,
    outcome: result.outcome,
    itemCount: result.items.length,
    warnings: hasWarnings ? result.warnings : undefined,
    durationMs,
    evidenceClass: contract.evidenceClass,
    completenessSemantics: contract.completeness,
    freshnessTargetHours: contract.freshnessSloHours,
    // A live availability probe cannot measure publication-to-ingestion lag.
    freshnessLagHours: null,
    freshnessMeasurement: 'not_available_from_live_probe',
    // Reconciliation happens after acquisition and is not visible to this probe.
    fuzzyReconcileRatio: null,
    parityDelta,
    channelItemCounts: result.diagnostics?.channelItemCounts,
  }
}

async function checkScraper(
  name: ProductionSourceId,
  run: (signal: AbortSignal) => Promise<ScraperResult>,
): Promise<ScraperHealthResult> {
  const start = Date.now()
  try {
    const result = await withTimeout(run, TIMEOUT_MS, name)
    const durationMs = Date.now() - start
    return assessScraperResult(name, result, durationMs)
  } catch (err) {
    console.error(`[scraper-health] ${name} failed:`, err instanceof Error ? err.message : String(err))
    return {
      source: name,
      healthy: false,
      outcome: 'failed',
      itemCount: 0,
      error: 'Scraper check failed',
      durationMs: Date.now() - start,
      evidenceClass: SOURCE_AUTHORITY[name].evidenceClass,
      completenessSemantics: SOURCE_AUTHORITY[name].completeness,
      freshnessTargetHours: SOURCE_AUTHORITY[name].freshnessSloHours,
      freshnessLagHours: null,
      freshnessMeasurement: 'not_available_from_live_probe',
      fuzzyReconcileRatio: null,
      parityDelta: null,
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

  const sources = Object.keys(PRODUCTION_SCRAPERS) as ProductionSourceId[]
  const results = await Promise.all(
    sources.map(source => checkScraper(source, signal => PRODUCTION_SCRAPERS[source]({ ...params, signal }))),
  )

  const degradedCount = results.filter((r) => !r.healthy).length

  if (degradedCount > 0) {
    try {
      await sendScraperHealthAlert(results)
    } catch (emailErr) {
      console.error(
        '[scraper-health] Failed to send alert email:',
        emailErr instanceof Error ? emailErr.message : String(emailErr),
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
