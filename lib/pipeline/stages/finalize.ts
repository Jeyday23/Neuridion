import { logAuditEvent } from '@/lib/audit'
import { sendSearchRunNotification } from '@/lib/email'
import type { PipelineContext } from '../types'

export function computeRunStatus(warnings: string[], itemCount: number): 'complete' | 'degraded' | 'error' {
  if (warnings.length > 0 && itemCount === 0) {
    const isInfoOnly = warnings.every(w => /returned 0|no .* found/i.test(w))
    return isInfoOnly ? 'complete' : 'error'
  }
  if (warnings.length > 0) return 'degraded'
  return 'complete'
}

export async function finalizeStage(ctx: PipelineContext): Promise<void> {
  const counts = ctx.decisions.reduce(
    (acc, d) => { acc[d.decision] = (acc[d.decision] ?? 0) + 1; return acc },
    { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>,
  )

  const runStatus = computeRunStatus(ctx.warnings, ctx.insertedRows.length)

  const { error: finalizeError } = await ctx.db.from('search_runs').update({
    status:              runStatus,
    error_message:       ctx.warnings.length > 0 ? ctx.warnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    total_results:       counts.relevant + counts.uncertain + counts.excluded + (counts.filter_failed ?? 0),
    total_scraped:       ctx.insertedRows.length,
    pre_filter_count:    ctx.insertedRows.length,
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
