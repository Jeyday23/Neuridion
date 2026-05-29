import { createAdminClient } from '@/lib/supabase/admin'
import { buildManufacturerSearchTerms, extractManufacturerTerms, extractCompetitorTokens } from '@/lib/search/manufacturer-terms'
import { scrapeStage, shouldBypassCoverageCache } from './stages/scrape'
import { insertResultsStage } from './stages/insert-results'
import { filterStage } from './stages/filter'
import { persistDecisionsStage } from './stages/persist-decisions'
import { finalizeStage } from './stages/finalize'
import { z } from 'zod'
import type { PipelineContext, ProfileRow, SearchJobPayload, ProgressUpdate } from './types'

export type { SearchJobPayload, ProgressUpdate }
export { shouldBypassCoverageCache }

export const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  competitor_terms: z.array(z.string().max(100)).max(20).optional(),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})

const SCRAPER_IDS = new Set(['bfarm', 'mhra', 'fda', 'swissmedic'])

export async function runSearchPipeline(
  runId: string,
  payload: SearchJobPayload,
  onProgress?: (update: ProgressUpdate) => Promise<void>,
): Promise<void> {
  const db = createAdminClient()
  console.error('[lifecycle]', `run_id=${runId} transition pending→running started`)

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('device_name, manufacturer, intended_use, emdn_code, device_class, search_strategy')
    .eq('id', payload.profile_id)
    .single()
  if (profileError || !profile) throw new Error(`Profile ${payload.profile_id} not found`)

  const { data: userFlags } = await db
    .from('users')
    .select('ai_opt_out')
    .eq('id', payload.user_id)
    .single()
  const aiOptOut = userFlags?.ai_opt_out === true

  const searchTerms = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const strategy = profile.search_strategy as { competitor_terms?: Array<{ name: string; manufacturer?: string }> } | null
  const rawCompetitorTerms = Array.isArray(strategy?.competitor_terms)
    ? strategy.competitor_terms
    : []
  const competitorTerms = extractCompetitorTokens(rawCompetitorTerms)
  const activeSources = payload.selected_dbs.filter((id) => SCRAPER_IDS.has(id))
  if (activeSources.length === 0) activeSources.push('bfarm')

  // Persist search terms for audit trail
  const globalMfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const globalDevTerms = searchTerms.filter(t => !globalMfrTerms.includes(t))
  try {
    const termsPayload = TermsUsedSchema.parse({
      manufacturer_terms: globalMfrTerms,
      device_terms: globalDevTerms,
      competitor_terms: competitorTerms,
      raw_manufacturer: profile.manufacturer ?? '',
      raw_device_name: profile.device_name ?? '',
      term_algorithm_version: '1',
    })
    const { error: termsError } = await db
      .from('search_runs')
      .update({ terms_used: termsPayload })
      .eq('id', runId)
    if (termsError) console.error('[pipeline] Failed to persist terms_used:', termsError.message)
  } catch (e) {
    console.error('[pipeline] terms_used validation failed:', e)
  }

  // Cancellation checker — cached for 2 seconds to avoid hammering the DB.
  // Stages call ctx.isCancelled() at inner loop checkpoints.
  let lastCancelCheck = 0
  let cachedCancelled = false
  const isCancelled = async (): Promise<boolean> => {
    const now = Date.now()
    if (now - lastCancelCheck < 2_000) return cachedCancelled
    lastCancelCheck = now
    const { data } = await db.from('search_runs').select('status').eq('id', runId).single()
    cachedCancelled = data?.status === 'cancelled'
    return cachedCancelled
  }

  const ctx: PipelineContext = {
    runId, payload, db, profile: profile as ProfileRow, aiOptOut, searchTerms, competitorTerms, activeSources,
    items: [], contentChanged: new Set(), canonicalIds: new Map(),
    insertedRows: [], decisions: [], warnings: [], timing: {},
    onProgress,
    isCancelled,
  }

  const stages = [scrapeStage, insertResultsStage, filterStage, persistDecisionsStage]

  // Stages whose failure should abort the pipeline and mark the run as 'error'.
  // A scrape failure with 0 items is recoverable (finalizeStage handles it),
  // but filter/persist failures produce incomplete data that must not be reported as success.
  const criticalStages = new Set([filterStage, persistDecisionsStage])

  for (const stage of stages) {
    const { data: runCheck } = await db.from('search_runs').select('status').eq('id', runId).single()
    if (runCheck?.status === 'cancelled') {
      console.error(`[pipeline] run_id=${runId} cancelled by user — aborting before ${stage.name}`)
      return
    }

    const stageName = stage.name || 'unknown'
    const stageStart = Date.now()
    console.error(`[pipeline] run_id=${runId} stage=${stageName} started`)
    try {
      await stage(ctx)
      const elapsed = Date.now() - stageStart
      ctx.timing[`${stageName}_ms`] = elapsed
      console.error(`[pipeline] run_id=${runId} stage=${stageName} completed in ${Math.round(elapsed / 1000)}s (items=${ctx.items.length} warnings=${ctx.warnings.length})`)
    } catch (err) {
      const elapsed = Math.round((Date.now() - stageStart) / 1000)
      const msg = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' ← ') : undefined
      ctx.warnings.push(`${stageName} failed: Pipeline stage error.`)
      console.error(`[pipeline] run_id=${runId} stage=${stageName} FAILED in ${elapsed}s: ${msg}`)
      if (stack) console.error(`[pipeline] run_id=${runId} stage=${stageName} stack: ${stack}`)

      if (criticalStages.has(stage)) {
        console.error(`[pipeline] run_id=${runId} critical stage ${stageName} failed — aborting pipeline`)
        await db.from('search_runs').update({
          status: 'error',
          error_message: 'The search pipeline encountered an error. Please try again or contact support.',
          completed_at: new Date().toISOString(),
          progress: null,
        }).eq('id', runId)
        return
      }
    }
  }

  try {
    await finalizeStage(ctx)
    ctx.timing.total_items_scraped = ctx.items.length
    ctx.timing.total_items_filtered = ctx.decisions.length
    await db.from('search_runs').update({ timing: ctx.timing }).eq('id', runId)
  } catch (err) {
    console.error('[pipeline] finalize failed:', err instanceof Error ? err.message : String(err))
    await db.from('search_runs').update({
      status: 'error',
      error_message: 'The search pipeline encountered an error. Please try again or contact support.',
      completed_at: new Date().toISOString(),
      progress: null,
    }).eq('id', runId)
    throw err
  }
}
