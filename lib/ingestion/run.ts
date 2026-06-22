import { createAdminClient } from '@/lib/supabase/admin'
import { captureAdapterOutput } from '@/lib/evidence/store'
import { EVIDENCE_ADAPTER_VERSIONS } from '@/lib/evidence/constants'
import { getProductionScraper } from '@/lib/scrapers/registry'
import { fetchBfarmRss, mergeBfarmFreshness } from '@/lib/scrapers/bfarm-rss'
import { upsertCanonical } from '@/lib/sync/canonical'
import { getCoveredRanges, mergeCoverage } from '@/lib/sync/coverage'
import type { Json } from '@/types/supabase'
import { computeFetchWindow } from './coverage'
import { INGESTION_SCHEDULES, type ScheduledSource } from './config'

export interface IngestionSummary {
  runId: string
  source: ScheduledSource
  outcome: 'running' | 'complete' | 'empty' | 'partial' | 'failed'
  observations: number
  newRevisions: number
  duplicate: boolean
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/timeout|aborted/i.test(message)) return 'timeout'
  if (/evidence|storage/i.test(message)) return 'evidence_write_failed'
  if (/canonical/i.test(message)) return 'canonical_write_failed'
  return 'ingestion_failed'
}

export async function ingestSource(input: {
  runId: string
  source: ScheduledSource
  asOfDate: string
}): Promise<IngestionSummary> {
  const db = createAdminClient()
  const config = INGESTION_SCHEDULES[input.source]
  const adapterVersion = EVIDENCE_ADAPTER_VERSIONS[input.source]
  const covered = await getCoveredRanges(input.source)
  const window = computeFetchWindow({
    asOfDate: input.asOfDate,
    covered,
    overlapDays: config.overlapDays,
    lookbackDays: config.lookbackDays,
  })

  const { data: claimed, error: claimError } = await db.rpc('claim_ingestion_run', {
    p_id: input.runId,
    p_source: input.source,
    p_adapter_version: adapterVersion,
    p_window_from: window.from,
    p_window_to: window.to,
  })
  if (claimError) throw new Error(`Ingestion claim failed: ${claimError.message}`)
  if (!claimed) {
    const { data: existing } = await db.from('ingestion_runs')
      .select('status,observations,new_revisions').eq('id', input.runId).single()
    return {
      runId: input.runId,
      source: input.source,
      outcome: existing?.status === 'running' ? 'running'
        : existing?.status === 'empty' ? 'empty'
        : existing?.status === 'partial' ? 'partial'
          : existing?.status === 'failed' ? 'failed' : 'complete',
      observations: existing?.observations ?? 0,
      newRevisions: existing?.new_revisions ?? 0,
      duplicate: true,
    }
  }

  const { data: claimedRun, error: claimedRunError } = await db.from('ingestion_runs')
    .select('source,window_from,window_to').eq('id', input.runId).single()
  if (claimedRunError || !claimedRun || claimedRun.source !== input.source) {
    throw new Error('Claimed ingestion run does not match its source')
  }
  const effectiveWindow = { from: claimedRun.window_from, to: claimedRun.window_to }

  const startedAt = new Date().toISOString()
  try {
    const scraper = getProductionScraper(input.source)
    if (!scraper) throw new Error(`No production adapter for ${input.source}`)
    const primaryResult = await scraper({
      fromDate: effectiveWindow.from,
      toDate: effectiveWindow.to,
      captureRawEvidence: input.source === 'bfarm',
    })
    const result = input.source === 'bfarm'
      ? mergeBfarmFreshness(primaryResult, await fetchBfarmRss({
        fromDate: effectiveWindow.from,
        toDate: effectiveWindow.to,
      }))
      : primaryResult
    const seen = new Set<string>()
    const items = result.items.filter((item) => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })
    if (items.length > config.maxItemsPerRun) {
      throw new Error(`Source returned ${items.length} items above ingestion safety cap ${config.maxItemsPerRun}`)
    }

    const canonical = await upsertCanonical(items)
    const authorityIds = new Map(
      items.map((item, index) => [item.external_id, canonical[index].canonical_id]),
    )
    const captured = await captureAdapterOutput({
      source: input.source,
      requestLocator: `scheduled://${input.source}?from=${effectiveWindow.from}&to=${effectiveWindow.to}`,
      startedAt,
      completedAt: new Date().toISOString(),
      outcome: result.outcome,
      warnings: result.warnings,
      items,
      rawArtifacts: result.rawArtifacts,
    }, authorityIds)

    if (result.outcome === 'complete' || result.outcome === 'empty') {
      await mergeCoverage(input.source, effectiveWindow)
    }

    const finishedAt = new Date().toISOString()
    const { error: finishError } = await db.from('ingestion_runs').update({
      status: result.outcome,
      observations: captured.observations,
      new_revisions: captured.revisions,
      warnings: result.warnings as Json,
      finished_at: finishedAt,
      lease_expires_at: finishedAt,
    }).eq('id', input.runId).eq('status', 'running')
    if (finishError) throw new Error(`Ingestion completion write failed: ${finishError.message}`)

    return {
      runId: input.runId,
      source: input.source,
      outcome: result.outcome,
      observations: captured.observations,
      newRevisions: captured.revisions,
      duplicate: false,
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    await db.from('ingestion_runs').update({
      status: 'failed',
      error_code: safeErrorCode(error),
      finished_at: finishedAt,
      lease_expires_at: finishedAt,
    }).eq('id', input.runId).eq('status', 'running')
    throw error
  }
}
