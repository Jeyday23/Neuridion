import { createAdminClient } from '@/lib/supabase/admin'
import { buildManufacturerSearchTerms, extractManufacturerTerms, extractCompetitorTokens } from '@/lib/search/manufacturer-terms'
import { scrapeStage } from './stages/scrape'
import { filterStage } from './stages/filter'
import { persistDecisionsStage } from './stages/persist-decisions'
import { finalizeStage } from './stages/finalize'
import { z } from 'zod'
import type { PipelineContext, ProfileRow, SearchJobPayload, ProgressUpdate } from './types'
import type { Json } from '@/types/supabase'
import {
  controlledEvidenceMetadata,
  loadProfileControlledEvidence,
  MAX_CONTROLLED_DOCUMENT_BYTES,
} from '@/lib/controlled-evidence/profile-evidence'

export type { SearchJobPayload, ProgressUpdate }

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

  // The worker uses a service-role client, so re-bind the signed job payload to
  // the exact run/user/profile tuple before any profile or storage access.
  const { data: ownedRun, error: ownedRunError } = await db
    .from('search_runs')
    .select('id')
    .eq('id', runId)
    .eq('user_id', payload.user_id)
    .eq('profile_id', payload.profile_id)
    .single()
  if (ownedRunError || !ownedRun) throw new Error('Search run ownership validation failed')

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('id, user_id, device_name, manufacturer, intended_use, emdn_code, device_class, ifu_storage_path, search_strategy')
    .eq('id', payload.profile_id)
    .eq('user_id', payload.user_id)
    .is('deleted_at', null)
    .single()
  if (profileError || !profile) throw new Error(`Profile ${payload.profile_id} not found`)

  const rawProfile = profile as ProfileRow
  const controlledEvidence = await loadProfileControlledEvidence(
    rawProfile,
    { profileId: payload.profile_id, userId: payload.user_id },
    async (bucket, path) => {
      const { data, error } = await db.storage.from(bucket).download(path)
      if (error || !data) throw new Error('storage download failed')
      if (data.size > MAX_CONTROLLED_DOCUMENT_BYTES) {
        throw new Error(`document exceeds the ${MAX_CONTROLLED_DOCUMENT_BYTES / 1024 / 1024} MB extraction limit`)
      }
      return new Uint8Array(await data.arrayBuffer())
    },
  )
  const enrichedProfile: ProfileRow = {
    ...rawProfile,
    controlled_evidence: controlledEvidence.documents,
    controlled_evidence_status: controlledEvidence.status,
    controlled_evidence_errors: controlledEvidence.errors,
  }

  // Freeze the exact controlled-evidence versions used by this run without
  // duplicating proprietary document text in the database snapshot.
  const snapshotWrite = await db.from('search_runs').update({
    profile_snapshot: {
      device_name: rawProfile.device_name,
      manufacturer: rawProfile.manufacturer,
      intended_use: rawProfile.intended_use,
      emdn_code: rawProfile.emdn_code,
      device_class: rawProfile.device_class,
      ifu_storage_path: rawProfile.ifu_storage_path ?? null,
      search_strategy: rawProfile.search_strategy,
      controlled_evidence_status: controlledEvidence.status,
      controlled_evidence: controlledEvidenceMetadata(controlledEvidence.documents),
    } as unknown as Json,
  })
    .eq('id', runId)
    .eq('user_id', payload.user_id)
    .eq('profile_id', payload.profile_id)
  if (snapshotWrite.error) {
    enrichedProfile.controlled_evidence_status = 'unavailable'
    enrichedProfile.controlled_evidence_errors = [
      ...controlledEvidence.errors,
      'controlled-evidence provenance could not be persisted to the run snapshot',
    ]
  }

  const { data: userFlags } = await db
    .from('users')
    .select('ai_opt_out')
    .eq('id', payload.user_id)
    .single()
  const aiOptOut = userFlags?.ai_opt_out === true || process.env.SKIP_AI_FILTER === 'true'

  const searchTerms = buildManufacturerSearchTerms(enrichedProfile.manufacturer ?? '', enrichedProfile.device_name ?? '')
  const strategy = enrichedProfile.search_strategy
  const rawCompetitorTerms = Array.isArray(strategy?.competitor_terms)
    ? strategy.competitor_terms
    : []
  const competitorTerms = extractCompetitorTokens(rawCompetitorTerms)
  const activeSources = payload.selected_dbs.filter((id) => SCRAPER_IDS.has(id))
  if (activeSources.length === 0) activeSources.push('bfarm')

  // Persist search terms for audit trail
  const globalMfrTerms = extractManufacturerTerms(enrichedProfile.manufacturer ?? '')
  const globalDevTerms = searchTerms.filter(t => !globalMfrTerms.includes(t))
  try {
    const termsPayload = TermsUsedSchema.parse({
      manufacturer_terms: globalMfrTerms,
      device_terms: globalDevTerms,
      competitor_terms: competitorTerms,
      raw_manufacturer: enrichedProfile.manufacturer ?? '',
      raw_device_name: enrichedProfile.device_name ?? '',
      term_algorithm_version: '1',
    })
    const { error: termsError } = await db
      .from('search_runs')
      .update({ terms_used: termsPayload })
      .eq('id', runId)
    if (termsError) console.error('[pipeline] Failed to persist terms_used:', termsError.message)
  } catch (e) {
    console.error('[pipeline] terms_used validation failed:', e instanceof Error ? e.message : String(e))
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

  const controlledEvidenceWarnings = enrichedProfile.controlled_evidence_status === 'unavailable'
    ? ['Referenced controlled product evidence was unavailable or could not be versioned; AI relevance classification was not applied and manual PRRC review is required.']
    : []
  const ctx: PipelineContext = {
    runId, payload, db, profile: enrichedProfile, aiOptOut, searchTerms, competitorTerms, activeSources,
    items: [], contentChanged: new Set(), canonicalIds: new Map(), authorityRevisionIds: new Map(),
    insertedRows: [], decisions: [], warnings: controlledEvidenceWarnings, timing: {
      controlled_evidence_status: enrichedProfile.controlled_evidence_status,
      controlled_evidence_documents: controlledEvidenceMetadata(enrichedProfile.controlled_evidence ?? []),
      controlled_evidence_errors: enrichedProfile.controlled_evidence_errors ?? [],
    }, sourceBreakdown: [],
    onProgress,
    isCancelled,
  }

  const stages = [scrapeStage, filterStage, persistDecisionsStage]

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
      console.error(`[pipeline] run_id=${runId} stage=${stageName} completed in ${Math.round(elapsed / 1000)}s (items=${ctx.insertedRows.length} warnings=${ctx.warnings.length})`)
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
    ctx.timing.source_breakdown = ctx.sourceBreakdown
    ctx.timing.total_raw_source_results = ctx.sourceBreakdown.reduce((sum, source) => sum + source.found_before_filtering, 0)
    ctx.timing.total_keyword_signaled_results = ctx.sourceBreakdown.reduce((sum, source) => sum + source.after_keyword_signal, 0)
    ctx.timing.total_items_scraped = ctx.insertedRows.length
    ctx.timing.total_items_filtered = ctx.decisions.length
    await finalizeStage(ctx)
    await db.from('search_runs').update({ timing: ctx.timing as Json }).eq('id', runId)
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
