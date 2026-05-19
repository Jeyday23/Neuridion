import { createHash } from 'crypto'
import pLimit from 'p-limit'
import { stage1Filter, getProfileFingerprint } from '@/lib/claude/filter-pipeline'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { fetchBfarmDetail } from '@/lib/scrapers/bfarm'
import { sanitizeForLlm } from '@/lib/scrapers/sanitize'
import type { PipelineContext, InsertedFsnRow } from '../types'

const TRUST_SOURCE_FILTER = new Set(['fda'])

function fsnIdOf(title: string): string {
  return createHash('sha256').update(title.toLowerCase().trim()).digest('hex').slice(0, 32)
}

export async function filterStage(ctx: PipelineContext): Promise<void> {
  if (ctx.insertedRows.length === 0) return

  const { profile, aiOptOut, insertedRows, contentChanged, db } = ctx
  const profileFingerprint = getProfileFingerprint(profile)

  // 1. Batch cache lookup
  const { data: cacheHits } = await db
    .from('filter_decision_cache')
    .select('fsn_external_id, decision, reasoning, confidence')
    .in('fsn_external_id', insertedRows.map((r) => fsnIdOf(r.title)))
    .eq('profile_fingerprint', profileFingerprint)

  const cacheMap = new Map<string, {
    decision: string; reasoning: string | null; confidence: string | null
  }>()
  for (const hit of cacheHits ?? []) cacheMap.set(hit.fsn_external_id, hit)

  const alreadyCached: InsertedFsnRow[] = []
  const needsFilter: InsertedFsnRow[] = []

  for (const row of insertedRows) {
    const skipCache = contentChanged.has(row.external_id ?? '')
    if (!skipCache && cacheMap.has(fsnIdOf(row.title))) {
      alreadyCached.push(row)
    } else {
      needsFilter.push(row)
    }
  }

  for (const row of alreadyCached) {
    const hit = cacheMap.get(fsnIdOf(row.title))!
    ctx.decisions.push({
      fsn_result_id: row.id,
      decision:      hit.decision as 'relevant' | 'uncertain' | 'excluded' | 'filter_failed',
      rationale:     hit.reasoning ?? '',
      confidence:    hit.confidence != null ? parseFloat(hit.confidence) / 100 : null,
      model:         null,
    })
  }

  // 2. Manufacturer keyword boost (informational only — never excludes items)
  // All items proceed to AI filtering regardless of keyword match.
  // Keyword match is recorded as a boost signal for downstream use.
  const ownFilterTerms    = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const deviceTerms       = ownFilterTerms.filter((t) => !manufacturerTerms.includes(t))
  const { competitorTerms } = ctx
  const keywordBoosted    = new Set<string>()

  for (const row of needsFilter) {
    if (row.source_db && TRUST_SOURCE_FILTER.has(row.source_db)) {
      keywordBoosted.add(row.id)
      continue
    }
    const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()
    let matches: boolean
    if (competitorTerms.some((t) => hay.includes(t.toLowerCase()))) {
      matches = true
    } else if (deviceTerms.length === 0) {
      matches = manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
    } else {
      const mfrMatch = manufacturerTerms.length === 0 || manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
      const devMatch = deviceTerms.some((t) => hay.includes(t.toLowerCase()))
      matches = mfrMatch && devMatch
    }
    if (matches) keywordBoosted.add(row.id)
  }

  const toFilter = needsFilter
  console.error('[pipeline]', `run_id=${ctx.runId} keyword_boost: ${keywordBoosted.size}/${needsFilter.length} items matched manufacturer terms`)

  // Prioritize keyword-matched items so the AI filter cap processes the most relevant first
  toFilter.sort((a, b) => {
    const aB = keywordBoosted.has(a.id) ? 0 : 1
    const bB = keywordBoosted.has(b.id) ? 0 : 1
    return aB - bB
  })

  // 3. AI filter (or opt-out)
  if (aiOptOut) {
    console.error('[pipeline]', `run_id=${ctx.runId} ai_opt_out=true — skipping AI filter, marking ${toFilter.length} items for manual review`)
    for (const row of toFilter) {
      ctx.decisions.push({
        fsn_result_id: row.id,
        decision:      'filter_failed',
        rationale:     'AI filtering disabled per user preference (GDPR Art 22).',
        confidence:    null,
        model:         null,
      })
    }
    return
  }

  // Per-run AI filter cap
  const MAX_FILTER_ITEMS = Math.max(1, parseInt(process.env.MAX_FILTER_ITEMS_PER_RUN ?? '300', 10))
  if (toFilter.length > MAX_FILTER_ITEMS) {
    const skipped = toFilter.splice(MAX_FILTER_ITEMS)
    console.error('[pipeline]', `item cap: ${skipped.length} items skipped (limit=${MAX_FILTER_ITEMS})`)
    for (const row of skipped) {
      ctx.decisions.push({
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
    toFilter.map((row) => filterLimit(async () => {
      const d = await stage1Filter(
        { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: row.raw_content ?? '', fsn_date: row.fsn_date },
        profile,
        { skipCache: true },
      )
      return { ...d, fsn_result_id: row.id }
    }))
  )
  ctx.decisions.push(...filterResults)

  // 4. BfArM detail enrichment for uncertain items
  const uncertainBfarm = filterResults.filter(
    d => d.decision === 'uncertain' && toFilter.find(r => r.id === d.fsn_result_id)?.source_db === 'bfarm'
  )
  if (uncertainBfarm.length > 0) {
    const detailLimit = pLimit(2)
    const pendingUpdates: { id: string; content: string }[] = []
    const enriched = await Promise.all(
      uncertainBfarm.map(d => detailLimit(async () => {
        const row = toFilter.find(r => r.id === d.fsn_result_id)
        if (!row) return null
        const fsnRow = ctx.items.find(i => i.external_id === row.external_id)
        if (!fsnRow) return null
        const detail = await fetchBfarmDetail(fsnRow.source_url)
        if (!detail) return null
        const enrichedContent = sanitizeForLlm(`${row.title}\n\n${detail}`)
        pendingUpdates.push({ id: row.id, content: enrichedContent })
        const refiltered = await stage1Filter(
          { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: enrichedContent, fsn_date: row.fsn_date },
          profile,
          { skipCache: true },
        )
        return { ...refiltered, fsn_result_id: row.id }
      }))
    )

    // Batch all content updates
    if (pendingUpdates.length > 0) {
      await Promise.all(
        pendingUpdates.map((u) => db.from('fsn_results').update({ raw_content: u.content }).eq('id', u.id))
      )
    }

    for (const result of enriched) {
      if (!result || result.decision === 'uncertain') continue
      const idx = ctx.decisions.findIndex(d => d.fsn_result_id === result.fsn_result_id)
      if (idx !== -1) ctx.decisions[idx] = result
    }
  }
}
