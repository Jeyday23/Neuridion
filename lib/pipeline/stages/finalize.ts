import { logAuditEvent } from '@/lib/audit'
import { sendSearchRunNotification } from '@/lib/email'
import { isCoverageAffectingWarning } from '@/lib/scrapers/bfarm'
import type { PipelineContext } from '../types'

const DATA_LOSS_PATTERN = /capped|result cap|dropped|incomplete|missing|structure.*changed|Pipeline stage error/i
const AI_REVIEW_UNAVAILABLE_PATTERN = /AI relevance review.*unavailable|manual PRRC review|required|provider.*billing|provider.*authentication/i
const BENIGN_EMPTY_SOURCE_WARNING = /database was unavailable during this search and returned no results|FIRECRAWL_API_KEY not set|Firecrawl fallback skipped: no credits|Firecrawl crawl timed out|BfArM primary scraper threw|outside the 3-year archive window/i

function isRunDegradingWarning(warning: string): boolean {
  if (BENIGN_EMPTY_SOURCE_WARNING.test(warning)) return false
  return isCoverageAffectingWarning(warning) || DATA_LOSS_PATTERN.test(warning) || AI_REVIEW_UNAVAILABLE_PATTERN.test(warning)
}

export function computeRunStatus(warnings: string[], itemCount: number): 'complete' | 'degraded' | 'error' {
  const degradingWarnings = warnings.filter(isRunDegradingWarning)
  if (warnings.length > 0 && itemCount === 0) {
    const hasDataLoss = degradingWarnings.some(w => DATA_LOSS_PATTERN.test(w) || isCoverageAffectingWarning(w))
    return hasDataLoss ? 'error' : 'complete'
  }
  if (degradingWarnings.length > 0) return 'degraded'
  return 'complete'
}

export async function finalizeStage(ctx: PipelineContext): Promise<void> {
  const counts = ctx.decisions.reduce(
    (acc, d) => { acc[d.decision] = (acc[d.decision] ?? 0) + 1; return acc },
    { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>,
  )

  const runStatus = computeRunStatus(ctx.warnings, ctx.insertedRows.length)
  const rawSourceTotal = ctx.sourceBreakdown.reduce((sum, source) => sum + source.found_before_filtering, 0)

  const { error: finalizeError } = await ctx.db.from('search_runs').update({
    status:              runStatus,
    error_message:       ctx.warnings.length > 0 ? ctx.warnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    total_results:       counts.relevant + counts.uncertain + counts.excluded,
    total_scraped:       ctx.insertedRows.length,
    pre_filter_count:    rawSourceTotal,
    progress:            null,
  }).eq('id', ctx.runId)
  if (finalizeError) throw new Error(`Failed to finalize run ${ctx.runId}: ${finalizeError.message}`)
  console.error('[lifecycle]', `run_id=${ctx.runId} transition running→${runStatus} at ${new Date().toISOString()}`)

  await logAuditEvent(ctx.payload.user_id, 'search_run', {
    run_id:         ctx.runId,
    profile_id:     ctx.payload.profile_id,
    result_count:   ctx.insertedRows.length,
    relevant_count: counts.relevant,
  })

  const { data: userData } = await ctx.db
    .from('users')
    .select('email, plan')
    .eq('id', ctx.payload.user_id)
    .single()

  if (userData?.email && userData.plan !== 'free' && process.env.RESEND_API_KEY) {
    sendSearchRunNotification(userData.email, {
      deviceName:     ctx.profile.device_name,
      manufacturer:   ctx.profile.manufacturer,
      periodFrom:     ctx.payload.period_from,
      periodTo:       ctx.payload.period_to,
      relevantCount:  counts.relevant,
      uncertainCount: counts.uncertain,
      excludedCount:  counts.excluded,
      runId:          ctx.runId,
    }).catch((err) => console.error('[pipeline] Email notification failed:', err instanceof Error ? err.message : String(err)))
  }
}
