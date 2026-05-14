import { createAdminClient } from '@/lib/supabase/admin'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { scrapeStage, shouldBypassCoverageCache } from './stages/scrape'
import { insertResultsStage } from './stages/insert-results'
import { filterStage } from './stages/filter'
import { persistDecisionsStage } from './stages/persist-decisions'
import { finalizeStage } from './stages/finalize'
import { z } from 'zod'
import type { PipelineContext, SearchJobPayload, ProgressUpdate } from './types'

export type { SearchJobPayload, ProgressUpdate }
export { shouldBypassCoverageCache }

export const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
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
    .select('device_name, manufacturer, intended_use, emdn_code, device_class')
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
  const activeSources = payload.selected_dbs.filter((id) => SCRAPER_IDS.has(id))
  if (activeSources.length === 0) activeSources.push('bfarm')

  // Persist search terms for audit trail
  const globalMfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const globalDevTerms = searchTerms.filter(t => !globalMfrTerms.includes(t))
  try {
    const termsPayload = TermsUsedSchema.parse({
      manufacturer_terms: globalMfrTerms,
      device_terms: globalDevTerms,
      raw_manufacturer: profile.manufacturer ?? '',
      raw_device_name: profile.device_name ?? '',
      term_algorithm_version: '1',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: termsError } = await (db as any)
      .from('search_runs')
      .update({ terms_used: termsPayload })
      .eq('id', runId)
    if (termsError) console.error('[pipeline] Failed to persist terms_used:', termsError.message)
  } catch (e) {
    console.error('[pipeline] terms_used validation failed:', e)
  }

  const ctx: PipelineContext = {
    runId, payload, db, profile, aiOptOut, searchTerms, activeSources,
    items: [], contentChanged: new Set(), canonicalIds: new Map(),
    insertedRows: [], decisions: [], warnings: [],
    onProgress,
  }

  const stages = [scrapeStage, insertResultsStage, filterStage, persistDecisionsStage]

  for (const stage of stages) {
    try {
      await stage(ctx)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.warnings.push(`${stage.name} failed: Pipeline stage error.`)
      console.error(`[pipeline] ${stage.name} failed:`, msg)
    }
  }

  try {
    await finalizeStage(ctx)
  } catch (err) {
    console.error('[pipeline] finalize failed:', err)
    await db.from('search_runs').update({
      status: 'error',
      error_message: 'The search pipeline encountered an error. Please try again or contact support.',
      completed_at: new Date().toISOString(),
      progress: null,
    }).eq('id', runId)
    throw err
  }
}
