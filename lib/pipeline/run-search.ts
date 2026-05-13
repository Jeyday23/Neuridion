import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeBfarm, fetchBfarmDetail, type ScrapedFsn, type ScraperResult, type ScraperParams } from '@/lib/scrapers/bfarm'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { scrapeMhra }       from '@/lib/scrapers/mhra'
import { scrapeFdaMaude }   from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { stage1Filter, getProfileFingerprint, type FilterDecision } from '@/lib/claude/filter-pipeline'
import { sendSearchRunNotification } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import pLimit from 'p-limit'
import { upsertCanonical, getCanonicalItems, computeContentHash } from '@/lib/sync/canonical'
import { sanitizeContent } from '@/lib/scrapers/sanitize'
import { z } from 'zod'

export const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})

// ── Public types ──────────────────────────────────────────────────────────────

export interface SearchJobPayload {
  profile_id:    string
  period_from:   string
  period_to:     string
  selected_dbs:  string[]
  user_id:       string
  force_refresh: boolean
}

export interface ProgressUpdate {
  current_source: string | null  // null = AI filtering phase
  sources_done:   string[]
  sources_total:  string[]
  items_found:    number
}

// Coverage cache is only valid for unfiltered (all-items) fetches. Any search
// with manufacturer terms must bypass it — a previous Siemens search populates
// canonical with Siemens items and marks the range covered; a later B. Braun
// search would then silently load those Siemens items and find nothing.
export function shouldBypassCoverageCache(searchTerms: string[]): boolean {
  return searchTerms.length > 0
}

// ── Scraper registry ──────────────────────────────────────────────────────────

const SCRAPERS: Record<string, (p: ScraperParams) => Promise<ScraperResult>> = {
  bfarm:      scrapeBfarm,
  mhra:       scrapeMhra,
  fda:        scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runSearchPipeline(
  runId: string,
  payload: SearchJobPayload,
  onProgress?: (update: ProgressUpdate) => Promise<void>,
): Promise<void> {
  const db = createAdminClient()
  let lifecycleComplete = false
  console.error('[lifecycle]', `run_id=${runId} transition pending→running started`)

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('device_name, manufacturer, intended_use, emdn_code, device_class')
    .eq('id', payload.profile_id)
    .single()
  if (profileError || !profile) throw new Error(`Profile ${payload.profile_id} not found`)
  const safeProfile = profile

  const { data: userFlags } = await db
    .from('users')
    .select('ai_opt_out')
    .eq('id', payload.user_id)
    .single()
  const aiOptOut = userFlags?.ai_opt_out === true

  const { period_from, period_to, force_refresh: forceRefresh } = payload
  const activeSources = payload.selected_dbs.filter((id) => SCRAPERS[id])
  if (activeSources.length === 0) activeSources.push('bfarm')

  // ── Persist search terms for audit trail ──────────────────────────────────
  const globalSearchTerms = buildManufacturerSearchTerms(
    safeProfile.manufacturer ?? '',
    safeProfile.device_name  ?? '',
  )
  const globalMfrTerms = extractManufacturerTerms(safeProfile.manufacturer ?? '')
  const globalDevTerms = globalSearchTerms.filter(t => !globalMfrTerms.includes(t))

  try {
    const termsPayload = TermsUsedSchema.parse({
      manufacturer_terms: globalMfrTerms,
      device_terms: globalDevTerms,
      raw_manufacturer: safeProfile.manufacturer ?? '',
      raw_device_name: safeProfile.device_name ?? '',
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

  const progressState: ProgressUpdate = {
    current_source: activeSources[0] ?? null,
    sources_done:   [],
    sources_total:  activeSources,
    items_found:    0,
  }

  interface SuccessfulSourceResult {
    sourceId:       string
    items:          ScrapedFsn[]
    warnings:       string[]
    contentChanged: Set<string>
    canonicalIds:   Map<string, string>
  }

  function prevDay(date: string): string {
    const d = new Date(date + 'T00:00:00.000Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  async function processSource(sourceId: string, sourceIndex: number): Promise<SuccessfulSourceResult> {
    const items:          ScrapedFsn[]        = []
    const warnings:       string[]            = []
    const contentChanged: Set<string>         = new Set()
    const canonicalIds:   Map<string, string> = new Map()
    const fetchedRanges:  { from: string; to: string }[] = []

    const searchTerms          = buildManufacturerSearchTerms(
      safeProfile.manufacturer ?? '',
      safeProfile.device_name  ?? '',
    )
    const hasManufacturerTerms = shouldBypassCoverageCache(searchTerms)

    async function fetchSourceRange(range: { from: string; to: string }): Promise<void> {
      const result = await SCRAPERS[sourceId]({
        fromDate:    range.from,
        toDate:      range.to,
        searchTerms: searchTerms.length > 0 ? searchTerms : undefined,
        profile:     {
          manufacturer: safeProfile.manufacturer ?? '',
          device_name:  safeProfile.device_name  ?? '',
        },
      })
      items.push(...result.items)
      warnings.push(...result.warnings)
      if (result.warnings.length === 0 && result.items.length > 0) fetchedRanges.push(range)
    }

    const overlapFrom = overlapWindowStart(period_to)

    if (forceRefresh || hasManufacturerTerms) {
      await fetchSourceRange({ from: period_from, to: period_to })
    } else {
      const covered    = await getCoveredRanges(sourceId)
      const gapCheckTo = overlapFrom > period_from ? prevDay(overlapFrom) : period_from
      const uncovered  = computeUncoveredRanges(covered, period_from, gapCheckTo)

      for (const range of uncovered) {
        await fetchSourceRange(range)
      }

      if (overlapFrom <= period_to) {
        await fetchSourceRange({ from: overlapFrom, to: period_to })
      }

      const mfrTerms = extractManufacturerTerms(safeProfile.manufacturer ?? '')
      const devTerms = searchTerms.filter((t) => !mfrTerms.includes(t))
      const coveredInWindow = covered.filter(
        (c) => c.to >= period_from && c.from <= (overlapFrom > period_from ? prevDay(overlapFrom) : period_from),
      )

      for (const range of coveredInWindow) {
        const canonFrom = range.from < period_from ? period_from : range.from
        const canonTo   = range.to   > period_to   ? period_to   : range.to
        const cached    = await getCanonicalItems(sourceId, canonFrom, canonTo)
        const filtered  = searchTerms.length === 0 ? cached : cached.filter((item) => {
          const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content ?? ''}`.toLowerCase()
          if (devTerms.length === 0) return mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const mfrMatch = mfrTerms.length === 0 || mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const devMatch = devTerms.some((t) => hay.includes(t.toLowerCase()))
          return mfrMatch && devMatch
        })
        items.push(...filtered)
      }
    }

    const seen    = new Set<string>()
    const deduped = items.filter((item) => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })

    let canonicalPersisted = deduped.length === 0
    if (deduped.length > 0) {
      try {
        const results = await upsertCanonical(deduped)
        for (let i = 0; i < results.length; i++) {
          canonicalIds.set(deduped[i].external_id, results[i].canonical_id)
          if (results[i].content_changed) contentChanged.add(deduped[i].external_id)
        }
        canonicalPersisted = true
      } catch (err) {
        console.error(`[pipeline] ${sourceId}: canonical upsert failed:`, err)
      }
    }

    if (canonicalPersisted && !hasManufacturerTerms) {
      for (const range of fetchedRanges) await mergeCoverage(sourceId, range)
    }

    // Emit progress after this source completes — before moving to the next
    progressState.sources_done.push(sourceId)
    progressState.current_source = activeSources[sourceIndex + 1] ?? null
    progressState.items_found   += deduped.length
    if (onProgress) await onProgress({ ...progressState, sources_done: [...progressState.sources_done] })

    return { sourceId, items: deduped, warnings, contentChanged, canonicalIds }
  }

  try {

  // ── Step 1: Scrape all sources ───────────────────────────────────────────────

  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => processSource(id, idx)),
  )

  const items:            ScrapedFsn[]    = []
  const allWarnings:      string[]        = []
  const allContentChanged = new Set<string>()
  const allCanonicalIds   = new Map<string, string>()

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      items.push(...r.value.items)
      allWarnings.push(...r.value.warnings)
      r.value.contentChanged.forEach((id) => allContentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => allCanonicalIds.set(eid, cid))
    } else {
      const sourceLabel = activeSources[i].toUpperCase()
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
      allWarnings.push(
        `${sourceLabel} database was unavailable during this search and returned no results.`
      )
    }
  }

  const allFailed = sourceResults.every(r => r.status === 'rejected')
  if (allFailed) {
    throw new Error('All selected databases failed. No results could be retrieved.')
  }

  // ── Step 2: Insert fsn_results ───────────────────────────────────────────────

  let insertedRows: {
    id: string; external_id: string | null; title: string
    manufacturer: string | null; raw_content: string | null; fsn_date: string | null
    source_db: string | null
  }[] = []

  if (items.length > 0) {
    const { data: inserted, error: insertError } = await db
      .from('fsn_results')
      .insert(items.map((item) => ({
        run_id:       runId,
        external_id:  item.external_id,
        title:        item.title,
        manufacturer: item.manufacturer ?? '',
        fsn_date:     item.fsn_date || null,
        source_url:   item.source_url,
        raw_content:  item.raw_content,
        source_db:    item.source_db,
        content_hash: computeContentHash(item),
        canonical_id: allCanonicalIds.get(item.external_id) ?? null,
      })))
      .select('id, external_id, title, manufacturer, raw_content, fsn_date, source_db')

    if (insertError) throw new Error(`fsn_results insert: ${insertError.message} (code=${insertError.code})`)
    insertedRows = inserted ?? []
  }
  // ── Step 3: AI filter ────────────────────────────────────────────────────────

  const fsnIdOf = (title: string) =>
    createHash('sha256').update(title.toLowerCase().trim()).digest('hex').slice(0, 32)

  const filterSearchTerms  = buildManufacturerSearchTerms(safeProfile.manufacturer ?? '', safeProfile.device_name ?? '')
  const profileFingerprint = getProfileFingerprint(safeProfile)
  const decisions: (FilterDecision & { fsn_result_id: string })[] = []

  let needsFilter = insertedRows

  if (insertedRows.length > 0) {
    const { data: cacheHits } = await db
      .from('filter_decision_cache')
      .select('fsn_external_id, decision, reasoning, confidence')
      .in('fsn_external_id', insertedRows.map((r) => fsnIdOf(r.title)))
      .eq('profile_fingerprint', profileFingerprint)

    const cacheMap = new Map<string, {
      decision: string; reasoning: string | null; confidence: string | null
    }>()
    for (const hit of cacheHits ?? []) cacheMap.set(hit.fsn_external_id, hit)

    const alreadyCached: typeof insertedRows = []
    needsFilter = []

    for (const row of insertedRows) {
      const skipCache = allContentChanged.has(row.external_id ?? '')
      if (!skipCache && cacheMap.has(fsnIdOf(row.title))) {
        alreadyCached.push(row)
      } else {
        needsFilter.push(row)
      }
    }

    for (const row of alreadyCached) {
      const hit = cacheMap.get(fsnIdOf(row.title))!
      decisions.push({
        fsn_result_id: row.id,
        decision:      hit.decision as FilterDecision['decision'],
        rationale:     hit.reasoning ?? '',
        confidence:    hit.confidence != null ? parseFloat(hit.confidence) / 100 : null,
        model:         null,
      })
    }
  }

  const manufacturerTerms = extractManufacturerTerms(safeProfile.manufacturer ?? '')
  const deviceTerms       = filterSearchTerms.filter((t) => !manufacturerTerms.includes(t))
  let toFilter            = needsFilter

  const TRUST_SOURCE_FILTER = new Set(['fda'])

  if (filterSearchTerms.length > 0) {
    const mfrMatched:  typeof insertedRows = []
    const mfrExcluded: typeof insertedRows = []

    for (const row of needsFilter) {
      if (row.source_db && TRUST_SOURCE_FILTER.has(row.source_db)) {
        mfrMatched.push(row)
        continue
      }
      const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()
      let matches: boolean
      if (deviceTerms.length === 0) {
        matches = manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
      } else {
        const mfrMatch = manufacturerTerms.length === 0 || manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
        const devMatch = deviceTerms.some((t) => hay.includes(t.toLowerCase()))
        matches = mfrMatch && devMatch
      }
      if (matches) {
        mfrMatched.push(row)
      } else {
        mfrExcluded.push(row)
        decisions.push({
          fsn_result_id: row.id,
          decision:      'excluded',
          rationale:     'Manufacturer mismatch — not relevant to profile.',
          confidence:    0.95,
          model:         null,
        })
      }
    }

    toFilter = mfrMatched
  }

  if (aiOptOut) {
    console.error('[pipeline]', `run_id=${runId} ai_opt_out=true — skipping AI filter, marking ${toFilter.length} items for manual review`)
    for (const row of toFilter) {
      decisions.push({
        fsn_result_id: row.id,
        decision:      'filter_failed',
        rationale:     'AI filtering disabled per user preference (GDPR Art 22).',
        confidence:    null,
        model:         null,
      })
    }
  } else {
    // Per-run AI filter cap — prevents runaway spend on large result sets
    const MAX_FILTER_ITEMS = Math.max(1, parseInt(process.env.MAX_FILTER_ITEMS_PER_RUN ?? '300', 10))
    if (toFilter.length > MAX_FILTER_ITEMS) {
      const skipped = toFilter.splice(MAX_FILTER_ITEMS)
      console.error('[pipeline]', `item cap: ${skipped.length} items skipped (limit=${MAX_FILTER_ITEMS})`)
      for (const row of skipped) {
        decisions.push({
          fsn_result_id: row.id,
          decision:      'filter_failed',
          rationale:     `Run item limit (${MAX_FILTER_ITEMS}) reached — manual review required.`,
          confidence:    null,
          model:         null,
        })
      }
    }

    const filterLimit = pLimit(4)
    const filterResults = await Promise.all(
      toFilter.map((row, i) => filterLimit(async () => {
        const d = await stage1Filter(
          { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: row.raw_content ?? '', fsn_date: row.fsn_date },
          safeProfile,
          { skipCache: true },
        )
        return { ...d, fsn_result_id: row.id }
      }))
    )
    decisions.push(...filterResults)

    // ── Step 3b: BfArM detail enrichment for uncertain items ──────────────────
    const uncertainBfarm = filterResults.filter(
      d => d.decision === 'uncertain' && toFilter.find(r => r.id === d.fsn_result_id)?.source_db === 'bfarm'
    )
    if (uncertainBfarm.length > 0) {
      const detailLimit = pLimit(2)
      const enriched = await Promise.all(
        uncertainBfarm.map(d => detailLimit(async () => {
          const row = toFilter.find(r => r.id === d.fsn_result_id)
          if (!row) return null
          const fsnRow = items.find(i => i.external_id === row.external_id)
          if (!fsnRow) return null
          const detail = await fetchBfarmDetail(fsnRow.source_url)
          if (!detail) return null
          const enrichedContent = sanitizeContent(`${row.title}\n\n${detail}`)
          await db.from('fsn_results').update({ raw_content: enrichedContent }).eq('id', row.id)
          const refiltered = await stage1Filter(
            { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: enrichedContent, fsn_date: row.fsn_date },
            safeProfile,
            { skipCache: true },
          )
          return { ...refiltered, fsn_result_id: row.id, original_id: d.fsn_result_id }
        }))
      )
      for (const result of enriched) {
        if (!result || result.decision === 'uncertain') continue
        const idx = decisions.findIndex(d => d.fsn_result_id === result.fsn_result_id)
        if (idx !== -1) decisions[idx] = result
      }
    }
  }

  // ── Step 4: Insert filter_decisions ─────────────────────────────────────────

  if (decisions.length > 0) {
    const { error: decisionsError } = await db.from('filter_decisions').insert(
      decisions.map((d) => ({
        fsn_result_id: d.fsn_result_id,
        search_run_id: runId,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence,
        model_used:    d.model,
        stage:         'stage1',
      })),
    )
    if (decisionsError) throw new Error(`filter_decisions insert: ${decisionsError.message} (code=${decisionsError.code})`)
  }

  // ── Step 5: Finalise run ─────────────────────────────────────────────────────

  const counts = decisions.reduce(
    (acc, d) => { acc[d.decision] = (acc[d.decision] ?? 0) + 1; return acc },
    { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>,
  )

  const runStatus = allWarnings.length > 0 ? 'degraded' : 'complete'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: finalizeError } = await (db as any).from('search_runs').update({
    status:              runStatus,
    error_message:       allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    total_scraped:       items.length,
    pre_filter_count:    insertedRows.length,
    progress:            null,
  }).eq('id', runId)
  if (finalizeError) throw new Error(`Failed to finalize run ${runId}: ${finalizeError.message}`)
  lifecycleComplete = true
  console.error('[lifecycle]', `run_id=${runId} transition running→${runStatus} at ${new Date().toISOString()}`)

  // ── Step 6: Audit log ────────────────────────────────────────────────────────

  await logAuditEvent(payload.user_id, 'search_run', {
    run_id:         runId,
    profile_id:     payload.profile_id,
    result_count:   items.length,
    relevant_count: counts.relevant,
  })

  // ── Step 7: Email notification (paid plans only, fire-and-forget) ────────────

  const { data: userData } = await db
    .from('users')
    .select('email, plan')
    .eq('id', payload.user_id)
    .single()

  if (userData?.email && userData.plan !== 'free' && process.env.RESEND_API_KEY) {
    sendSearchRunNotification(userData.email, {
      deviceName:     safeProfile.device_name,
      manufacturer:   safeProfile.manufacturer,
      periodFrom:     period_from,
      periodTo:       period_to,
      relevantCount:  counts.relevant,
      uncertainCount: counts.uncertain,
      excludedCount:  counts.excluded,
      runId,
    }).catch((err) => console.error('[pipeline] Email notification failed:', err))
  }

  } catch (err) {
    if (!lifecycleComplete) {
      const msg = err instanceof Error ? err.message : String(err)
      // Store a generic message for the user, log the real error server-side
      console.error('[pipeline] Run failed:', msg)
      const safeMsg = 'The search pipeline encountered an error. Please try again or contact support if the issue persists.'
      await db.from('search_runs').update({
        status:        'error',
        error_message: safeMsg,
        completed_at:  new Date().toISOString(),
        progress:      null,
      }).eq('id', runId)
      console.error('[lifecycle]', `run_id=${runId} transition running→error (pipeline catch)`)
    }
    throw err
  }
}
