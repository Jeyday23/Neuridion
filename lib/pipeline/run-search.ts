import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeBfarm, type ScrapedFsn, type ScraperResult, type ScraperParams } from '@/lib/scrapers/bfarm'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { scrapeMhra }       from '@/lib/scrapers/mhra'
import { scrapeFdaMaude }   from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { stage1Filter, getProfileFingerprint, type FilterDecision } from '@/lib/claude/filter-pipeline'
import { sendSearchRunNotification } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems, computeContentHash } from '@/lib/sync/canonical'

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
  console.log(`[lifecycle] run_id=${runId} transition pending→running started`)

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('device_name, manufacturer, intended_use, emdn_code, device_class')
    .eq('id', payload.profile_id)
    .single()
  if (profileError || !profile) throw new Error(`Profile ${payload.profile_id} not found`)
  const safeProfile = profile

  const { period_from, period_to, force_refresh: forceRefresh } = payload
  const activeSources = payload.selected_dbs.filter((id) => SCRAPERS[id])
  if (activeSources.length === 0) activeSources.push('bfarm')

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
      if (result.warnings.length === 0) fetchedRanges.push(range)
    }

    const overlapFrom = overlapWindowStart(period_to)

    if (forceRefresh || hasManufacturerTerms) {
      if (hasManufacturerTerms) {
        console.log(`[pipeline] ${sourceId}: manufacturer filter present — bypassing coverage cache, fetching full range`)
      }
      await fetchSourceRange({ from: period_from, to: period_to })
    } else {
      const covered    = await getCoveredRanges(sourceId)
      const gapCheckTo = overlapFrom > period_from ? prevDay(overlapFrom) : period_from
      const uncovered  = computeUncoveredRanges(covered, period_from, gapCheckTo)

      for (const range of uncovered) {
        console.log(`[pipeline] ${sourceId}: fetching uncovered ${range.from} → ${range.to}`)
        await fetchSourceRange(range)
      }

      if (overlapFrom <= period_to) {
        console.log(`[pipeline] ${sourceId}: fetching overlap window ${overlapFrom} → ${period_to}`)
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
        console.log(`[pipeline] ${sourceId}: ${filtered.length}/${cached.length} from canonical (${canonFrom} → ${canonTo})`)
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
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
    }
  }

  console.log(`[pipeline] Combined: ${items.length} items from ${activeSources.length} source(s)`)

  // ── Step 2: Insert fsn_results ───────────────────────────────────────────────

  let insertedRows: {
    id: string; external_id: string; title: string
    manufacturer: string; raw_content: string; fsn_date: string | null
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
      .select('id, external_id, title, manufacturer, raw_content, fsn_date')

    if (insertError) throw insertError
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
      .select('fsn_external_id, decision, rationale, confidence, model_used')
      .in('fsn_external_id', insertedRows.map((r) => fsnIdOf(r.title)))
      .eq('profile_fingerprint', profileFingerprint)

    const cacheMap = new Map<string, {
      decision: string; rationale: string | null
      confidence: number | null; model_used: string | null
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

    console.log(`[pipeline] cache hits: ${alreadyCached.length}/${insertedRows.length}`)
    for (const row of alreadyCached) {
      const hit = cacheMap.get(fsnIdOf(row.title))!
      decisions.push({
        fsn_result_id: row.id,
        decision:      hit.decision as FilterDecision['decision'],
        rationale:     hit.rationale ?? '',
        confidence:    hit.confidence != null ? hit.confidence / 100 : null,
        model:         hit.model_used ?? null,
      })
    }
  }

  const manufacturerTerms = extractManufacturerTerms(safeProfile.manufacturer ?? '')
  const deviceTerms       = filterSearchTerms.filter((t) => !manufacturerTerms.includes(t))
  let toFilter            = needsFilter

  if (filterSearchTerms.length > 0) {
    const mfrMatched:  typeof insertedRows = []
    const mfrExcluded: typeof insertedRows = []

    for (const row of needsFilter) {
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

    console.log(`[pipeline] pre-filter: ${mfrMatched.length} pass, ${mfrExcluded.length} excluded`)
    toFilter = mfrMatched
  }

  console.log(`[pipeline] AI filter starting: ${toFilter.length} items to filter`)

  // Per-run AI filter cap — prevents runaway spend on large result sets
  const MAX_FILTER_ITEMS = Math.max(1, parseInt(process.env.MAX_FILTER_ITEMS_PER_RUN ?? '300', 10))
  if (toFilter.length > MAX_FILTER_ITEMS) {
    const skipped = toFilter.splice(MAX_FILTER_ITEMS)
    console.warn(`[pipeline] item cap: ${skipped.length} items skipped (limit=${MAX_FILTER_ITEMS})`)
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

  for (let i = 0; i < toFilter.length; i++) {
    const row = toFilter[i]
    const d = await stage1Filter(
      { title: row.title, manufacturer: row.manufacturer, raw_content: row.raw_content, fsn_date: row.fsn_date },
      safeProfile,
      { skipCache: true },
    )
    decisions.push({ ...d, fsn_result_id: row.id })
    if ((i + 1) % 25 === 0) {
      console.log(`[pipeline] AI filter: ${i + 1}/${toFilter.length}`)
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  console.log(`[pipeline] AI filter complete: ${decisions.length} decisions (${toFilter.length} AI-filtered)`)

  // ── Step 4: Insert filter_decisions ─────────────────────────────────────────

  if (decisions.length > 0) {
    const { error: decisionsError } = await db.from('filter_decisions').insert(
      decisions.map((d) => ({
        fsn_result_id: d.fsn_result_id,
        search_run_id: runId,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence,
        model:         d.model,
      })),
    )
    if (decisionsError) throw decisionsError
  }

  // ── Step 5: Finalise run ─────────────────────────────────────────────────────

  const counts = decisions.reduce(
    (acc, d) => { acc[d.decision] = (acc[d.decision] ?? 0) + 1; return acc },
    { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>,
  )

  const runStatus = allWarnings.length > 0 ? 'degraded' : 'complete'

  const { error: finalizeError } = await db.from('search_runs').update({
    status:              runStatus,
    error_message:       allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    progress:            null,
  }).eq('id', runId)
  if (finalizeError) throw new Error(`Failed to finalize run ${runId}: ${finalizeError.message}`)
  lifecycleComplete = true
  console.log(`[lifecycle] run_id=${runId} transition running→${runStatus} at ${new Date().toISOString()}`)

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
      console.error(`[lifecycle] run_id=${runId} pipeline error: ${msg}`)
      await db.from('search_runs').update({
        status:        'error',
        error_message: msg,
        completed_at:  new Date().toISOString(),
        progress:      null,
      }).eq('id', runId)
      console.log(`[lifecycle] run_id=${runId} transition running→error (pipeline catch)`)
    }
    throw err
  }
}
