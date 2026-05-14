# Pipeline Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `lib/pipeline/run-search.ts` (549-line monolith) into 5 discrete pipeline stages, a shared types file, and a ~60-line orchestrator with stage-level error isolation.

**Architecture:** Extract each pipeline phase (scrape, insert, filter, persist, finalize) into its own file under `lib/pipeline/stages/`. A shared `PipelineContext` object flows through all stages. The orchestrator calls stages sequentially with per-stage try/catch — failures accumulate as warnings and downstream stages handle empty inputs gracefully. Zero behavior changes to the `process-job/route.ts` caller.

**Tech Stack:** TypeScript, Next.js 16, Supabase, Anthropic SDK, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/pipeline/types.ts` | Create | Shared types: PipelineContext, SearchJobPayload, ProgressUpdate, ProfileRow, InsertedFsnRow, DecisionRow |
| `lib/pipeline/stages/scrape.ts` | Create | Scraper fan-out, dedup, canonical upsert, coverage merge (~130 lines) |
| `lib/pipeline/stages/insert-results.ts` | Create | Insert fsn_results rows (~30 lines) |
| `lib/pipeline/stages/filter.ts` | Create | Cache check, manufacturer pre-filter, AI filter, BfArM enrichment (~130 lines) |
| `lib/pipeline/stages/persist-decisions.ts` | Create | Insert filter_decisions rows (~20 lines) |
| `lib/pipeline/stages/finalize.ts` | Create | Counts, status update, audit log, email (~60 lines) |
| `lib/pipeline/run-search.ts` | Rewrite | Orchestrator (~80 lines) |
| `__tests__/unit/pipeline/finalize.test.ts` | Create | Unit tests for finalize stage status logic |
| `__tests__/unit/pipeline/orchestrator.test.ts` | Create | Unit tests for orchestrator error handling |

---

### Task 1: Create Shared Types (`types.ts`)

**Files:**
- Create: `lib/pipeline/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// lib/pipeline/types.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import type { FilterDecision } from '@/lib/claude/filter-pipeline'
import type { Database } from '@/types/supabase'

export interface SearchJobPayload {
  profile_id:    string
  period_from:   string
  period_to:     string
  selected_dbs:  string[]
  user_id:       string
  force_refresh: boolean
}

export interface ProgressUpdate {
  current_source: string | null
  sources_done:   string[]
  sources_total:  string[]
  items_found:    number
}

export interface ProfileRow {
  device_name:   string
  manufacturer:  string
  intended_use:  string | null
  emdn_code:     string | null
  device_class:  string | null
}

export interface InsertedFsnRow {
  id:           string
  external_id:  string | null
  title:        string
  manufacturer: string | null
  raw_content:  string | null
  fsn_date:     string | null
  source_db:    string | null
}

export interface DecisionRow extends FilterDecision {
  fsn_result_id: string
}

export interface PipelineContext {
  runId:           string
  payload:         SearchJobPayload
  db:              SupabaseClient<Database>
  profile:         ProfileRow
  aiOptOut:        boolean
  searchTerms:     string[]
  activeSources:   string[]

  items:           ScrapedFsn[]
  contentChanged:  Set<string>
  canonicalIds:    Map<string, string>
  insertedRows:    InsertedFsnRow[]
  decisions:       DecisionRow[]
  warnings:        string[]

  onProgress?:     (update: ProgressUpdate) => Promise<void>
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/types.ts
git commit -m "refactor(pipeline): add shared types for pipeline decomposition

Introduces PipelineContext, SearchJobPayload, ProgressUpdate, ProfileRow,
InsertedFsnRow, and DecisionRow types used by all pipeline stages.

Co-Authored-By: Neuridion"
```

---

### Task 2: Create Scrape Stage (`stages/scrape.ts`)

**Files:**
- Create: `lib/pipeline/stages/scrape.ts`

- [ ] **Step 1: Create the scrape stage file**

```typescript
// lib/pipeline/stages/scrape.ts
import { scrapeBfarm, type ScrapedFsn, type ScraperResult, type ScraperParams } from '@/lib/scrapers/bfarm'
import { scrapeMhra }       from '@/lib/scrapers/mhra'
import { scrapeFdaMaude }   from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems } from '@/lib/sync/canonical'
import type { PipelineContext, ProgressUpdate } from '../types'

const SCRAPERS: Record<string, (p: ScraperParams) => Promise<ScraperResult>> = {
  bfarm:      scrapeBfarm,
  mhra:       scrapeMhra,
  fda:        scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

export function shouldBypassCoverageCache(searchTerms: string[]): boolean {
  return searchTerms.length > 0
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function scrapeStage(ctx: PipelineContext): Promise<void> {
  const { payload, profile, searchTerms, activeSources } = ctx
  const { period_from, period_to, force_refresh: forceRefresh } = payload

  const progressState: ProgressUpdate = {
    current_source: activeSources[0] ?? null,
    sources_done:   [],
    sources_total:  activeSources,
    items_found:    0,
  }

  async function processSource(sourceId: string, sourceIndex: number): Promise<{
    items: ScrapedFsn[]; warnings: string[]; contentChanged: Set<string>; canonicalIds: Map<string, string>
  }> {
    const items:          ScrapedFsn[]        = []
    const warnings:       string[]            = []
    const contentChanged: Set<string>         = new Set()
    const canonicalIds:   Map<string, string> = new Map()
    const fetchedRanges:  { from: string; to: string }[] = []

    const localSearchTerms = buildManufacturerSearchTerms(
      profile.manufacturer ?? '',
      profile.device_name  ?? '',
    )
    const hasManufacturerTerms = shouldBypassCoverageCache(localSearchTerms)

    async function fetchSourceRange(range: { from: string; to: string }): Promise<void> {
      const result = await SCRAPERS[sourceId]({
        fromDate:    range.from,
        toDate:      range.to,
        searchTerms: localSearchTerms.length > 0 ? localSearchTerms : undefined,
        profile:     {
          manufacturer: profile.manufacturer ?? '',
          device_name:  profile.device_name  ?? '',
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

      const mfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
      const devTerms = localSearchTerms.filter((t) => !mfrTerms.includes(t))
      const coveredInWindow = covered.filter(
        (c) => c.to >= period_from && c.from <= (overlapFrom > period_from ? prevDay(overlapFrom) : period_from),
      )

      for (const range of coveredInWindow) {
        const canonFrom = range.from < period_from ? period_from : range.from
        const canonTo   = range.to   > period_to   ? period_to   : range.to
        const cached    = await getCanonicalItems(sourceId, canonFrom, canonTo)
        const filtered  = localSearchTerms.length === 0 ? cached : cached.filter((item) => {
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

    progressState.sources_done.push(sourceId)
    progressState.current_source = activeSources[sourceIndex + 1] ?? null
    progressState.items_found   += deduped.length
    if (ctx.onProgress) await ctx.onProgress({ ...progressState, sources_done: [...progressState.sources_done] })

    return { items: deduped, warnings, contentChanged, canonicalIds }
  }

  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => processSource(id, idx)),
  )

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      ctx.items.push(...r.value.items)
      ctx.warnings.push(...r.value.warnings)
      r.value.contentChanged.forEach((id) => ctx.contentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => ctx.canonicalIds.set(eid, cid))
    } else {
      const sourceLabel = activeSources[i].toUpperCase()
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
      ctx.warnings.push(
        `${sourceLabel} database was unavailable during this search and returned no results.`
      )
    }
  }

  const allFailed = sourceResults.every(r => r.status === 'rejected')
  if (allFailed) {
    throw new Error('All selected databases failed. No results could be retrieved.')
  }
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/stages/scrape.ts
git commit -m "refactor(pipeline): extract scrape stage

Moves scraper fan-out, dedup, canonical upsert, and coverage merge
logic from run-search.ts into a standalone stage function.

Co-Authored-By: Neuridion"
```

---

### Task 3: Create Insert Results Stage (`stages/insert-results.ts`)

**Files:**
- Create: `lib/pipeline/stages/insert-results.ts`

- [ ] **Step 1: Create the insert-results stage file**

```typescript
// lib/pipeline/stages/insert-results.ts
import { computeContentHash } from '@/lib/sync/canonical'
import type { PipelineContext } from '../types'

export async function insertResultsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.items.length === 0) return

  const { data: inserted, error: insertError } = await ctx.db
    .from('fsn_results')
    .insert(ctx.items.map((item) => ({
      run_id:       ctx.runId,
      external_id:  item.external_id,
      title:        item.title,
      manufacturer: item.manufacturer ?? '',
      fsn_date:     item.fsn_date || null,
      source_url:   item.source_url,
      raw_content:  item.raw_content,
      source_db:    item.source_db,
      content_hash: computeContentHash(item),
      canonical_id: ctx.canonicalIds.get(item.external_id) ?? null,
    })))
    .select('id, external_id, title, manufacturer, raw_content, fsn_date, source_db')

  if (insertError) throw new Error(`fsn_results insert: ${insertError.message} (code=${insertError.code})`)
  ctx.insertedRows = inserted ?? []
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/stages/insert-results.ts
git commit -m "refactor(pipeline): extract insert-results stage

Moves fsn_results DB insertion into a standalone stage function.
No-op when ctx.items is empty.

Co-Authored-By: Neuridion"
```

---

### Task 4: Create Filter Stage (`stages/filter.ts`)

**Files:**
- Create: `lib/pipeline/stages/filter.ts`

- [ ] **Step 1: Create the filter stage file**

```typescript
// lib/pipeline/stages/filter.ts
import { createHash } from 'crypto'
import pLimit from 'p-limit'
import { stage1Filter, getProfileFingerprint } from '@/lib/claude/filter-pipeline'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { fetchBfarmDetail } from '@/lib/scrapers/bfarm'
import { sanitizeContent } from '@/lib/scrapers/sanitize'
import type { PipelineContext, InsertedFsnRow } from '../types'

const TRUST_SOURCE_FILTER = new Set(['fda'])

function fsnIdOf(title: string): string {
  return createHash('sha256').update(title.toLowerCase().trim()).digest('hex').slice(0, 32)
}

export async function filterStage(ctx: PipelineContext): Promise<void> {
  if (ctx.insertedRows.length === 0) return

  const { profile, searchTerms, aiOptOut, insertedRows, contentChanged, db } = ctx
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
  let needsFilter: InsertedFsnRow[] = []

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

  // 2. Manufacturer pre-filter
  const filterSearchTerms = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const deviceTerms       = filterSearchTerms.filter((t) => !manufacturerTerms.includes(t))
  let toFilter            = needsFilter

  if (filterSearchTerms.length > 0) {
    const mfrMatched:  InsertedFsnRow[] = []
    const mfrExcluded: InsertedFsnRow[] = []

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
        ctx.decisions.push({
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
    const enriched = await Promise.all(
      uncertainBfarm.map(d => detailLimit(async () => {
        const row = toFilter.find(r => r.id === d.fsn_result_id)
        if (!row) return null
        const fsnRow = ctx.items.find(i => i.external_id === row.external_id)
        if (!fsnRow) return null
        const detail = await fetchBfarmDetail(fsnRow.source_url)
        if (!detail) return null
        const enrichedContent = sanitizeContent(`${row.title}\n\n${detail}`)
        await db.from('fsn_results').update({ raw_content: enrichedContent }).eq('id', row.id)
        const refiltered = await stage1Filter(
          { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: enrichedContent, fsn_date: row.fsn_date },
          profile,
          { skipCache: true },
        )
        return { ...refiltered, fsn_result_id: row.id }
      }))
    )
    for (const result of enriched) {
      if (!result || result.decision === 'uncertain') continue
      const idx = ctx.decisions.findIndex(d => d.fsn_result_id === result.fsn_result_id)
      if (idx !== -1) ctx.decisions[idx] = result
    }
  }
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/stages/filter.ts
git commit -m "refactor(pipeline): extract filter stage

Moves cache check, manufacturer pre-filter, AI filter (Haiku+Sonnet),
and BfArM detail enrichment into a standalone stage function.

Co-Authored-By: Neuridion"
```

---

### Task 5: Create Persist Decisions Stage (`stages/persist-decisions.ts`)

**Files:**
- Create: `lib/pipeline/stages/persist-decisions.ts`

- [ ] **Step 1: Create the persist-decisions stage file**

```typescript
// lib/pipeline/stages/persist-decisions.ts
import type { PipelineContext } from '../types'

export async function persistDecisionsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.decisions.length === 0) return

  const { error: decisionsError } = await ctx.db.from('filter_decisions').insert(
    ctx.decisions.map((d) => ({
      fsn_result_id: d.fsn_result_id,
      search_run_id: ctx.runId,
      decision:      d.decision,
      rationale:     d.rationale,
      confidence:    d.confidence,
      model_used:    d.model,
      stage:         'stage1',
    })),
  )
  if (decisionsError) throw new Error(`filter_decisions insert: ${decisionsError.message} (code=${decisionsError.code})`)
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/stages/persist-decisions.ts
git commit -m "refactor(pipeline): extract persist-decisions stage

Moves filter_decisions batch insert into a standalone stage function.
No-op when ctx.decisions is empty.

Co-Authored-By: Neuridion"
```

---

### Task 6: Create Finalize Stage (`stages/finalize.ts`)

**Files:**
- Create: `lib/pipeline/stages/finalize.ts`
- Test: `__tests__/unit/pipeline/finalize.test.ts`

- [ ] **Step 1: Write failing tests for finalize status logic**

Create `__tests__/unit/pipeline/finalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeRunStatus } from '../../../lib/pipeline/stages/finalize'

describe('computeRunStatus', () => {
  it('returns "complete" when no warnings and items exist', () => {
    expect(computeRunStatus([], 5)).toBe('complete')
  })

  it('returns "degraded" when warnings exist but items also exist', () => {
    expect(computeRunStatus(['BfArM failed'], 5)).toBe('degraded')
  })

  it('returns "error" when warnings exist and no items', () => {
    expect(computeRunStatus(['All sources failed'], 0)).toBe('error')
  })

  it('returns "complete" when no warnings and no items (empty search)', () => {
    expect(computeRunStatus([], 0)).toBe('complete')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/unit/pipeline/finalize.test.ts`
Expected: FAIL — `computeRunStatus` not found

- [ ] **Step 3: Create the finalize stage file**

```typescript
// lib/pipeline/stages/finalize.ts
import { logAuditEvent } from '@/lib/audit'
import { sendSearchRunNotification } from '@/lib/email'
import type { PipelineContext } from '../types'

export function computeRunStatus(warnings: string[], itemCount: number): 'complete' | 'degraded' | 'error' {
  if (warnings.length > 0 && itemCount === 0) return 'error'
  if (warnings.length > 0) return 'degraded'
  return 'complete'
}

export async function finalizeStage(ctx: PipelineContext): Promise<void> {
  const counts = ctx.decisions.reduce(
    (acc, d) => { acc[d.decision] = (acc[d.decision] ?? 0) + 1; return acc },
    { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>,
  )

  const runStatus = computeRunStatus(ctx.warnings, ctx.items.length)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: finalizeError } = await (ctx.db as any).from('search_runs').update({
    status:              runStatus,
    error_message:       ctx.warnings.length > 0 ? ctx.warnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    total_scraped:       ctx.items.length,
    pre_filter_count:    ctx.insertedRows.length,
    progress:            null,
  }).eq('id', ctx.runId)
  if (finalizeError) throw new Error(`Failed to finalize run ${ctx.runId}: ${finalizeError.message}`)
  console.error('[lifecycle]', `run_id=${ctx.runId} transition running→${runStatus} at ${new Date().toISOString()}`)

  await logAuditEvent(ctx.payload.user_id, 'search_run', {
    run_id:         ctx.runId,
    profile_id:     ctx.payload.profile_id,
    result_count:   ctx.items.length,
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
    }).catch((err) => console.error('[pipeline] Email notification failed:', err))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/unit/pipeline/finalize.test.ts`
Expected: ALL PASS

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/stages/finalize.ts __tests__/unit/pipeline/finalize.test.ts
git commit -m "refactor(pipeline): extract finalize stage with status logic tests

Moves run finalization (counts, status, audit log, email) into a
standalone stage. Exports computeRunStatus() for unit testing.

Co-Authored-By: Neuridion"
```

---

### Task 7: Rewrite Orchestrator (`run-search.ts`)

**Files:**
- Modify: `lib/pipeline/run-search.ts` (complete rewrite)
- Test: `__tests__/unit/pipeline/orchestrator.test.ts`

- [ ] **Step 1: Write failing test for orchestrator error handling**

Create `__tests__/unit/pipeline/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('runSearchPipeline orchestrator', () => {
  it('continues to finalize when a middle stage throws', async () => {
    // This test validates the error isolation contract:
    // if filterStage throws, persistDecisionsStage still runs,
    // and finalizeStage always runs.

    const stageOrder: string[] = []

    vi.doMock('../../../lib/pipeline/stages/scrape', () => ({
      scrapeStage: async () => { stageOrder.push('scrape') },
    }))
    vi.doMock('../../../lib/pipeline/stages/insert-results', () => ({
      insertResultsStage: async () => { stageOrder.push('insert') },
    }))
    vi.doMock('../../../lib/pipeline/stages/filter', () => ({
      filterStage: async () => { stageOrder.push('filter'); throw new Error('AI unavailable') },
    }))
    vi.doMock('../../../lib/pipeline/stages/persist-decisions', () => ({
      persistDecisionsStage: async () => { stageOrder.push('persist') },
    }))
    vi.doMock('../../../lib/pipeline/stages/finalize', () => ({
      finalizeStage: async () => { stageOrder.push('finalize') },
    }))
    vi.doMock('../../../lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ single: () => ({ data: { device_name: 'Test', manufacturer: 'Test', intended_use: null, emdn_code: null, device_class: null }, error: null }) }) }),
          update: () => ({ eq: () => ({ error: null }) }),
        }),
      }),
    }))
    vi.doMock('../../../lib/search/manufacturer-terms', () => ({
      buildManufacturerSearchTerms: () => [],
      extractManufacturerTerms: () => [],
    }))

    const { runSearchPipeline } = await import('../../../lib/pipeline/run-search')

    await runSearchPipeline('test-run-id', {
      profile_id: 'p1', period_from: '2026-01-01', period_to: '2026-01-31',
      selected_dbs: ['bfarm'], user_id: 'u1', force_refresh: false,
    })

    expect(stageOrder).toEqual(['scrape', 'insert', 'filter', 'persist', 'finalize'])
  })
})
```

- [ ] **Step 2: Rewrite run-search.ts as orchestrator**

Replace the entire contents of `lib/pipeline/run-search.ts` with:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { scrapeStage } from './stages/scrape'
import { insertResultsStage } from './stages/insert-results'
import { filterStage } from './stages/filter'
import { persistDecisionsStage } from './stages/persist-decisions'
import { finalizeStage } from './stages/finalize'
import { z } from 'zod'
import type { PipelineContext, SearchJobPayload, ProgressUpdate } from './types'

export type { SearchJobPayload, ProgressUpdate }

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
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: All tests pass including new finalize tests and orchestrator test

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/run-search.ts __tests__/unit/pipeline/orchestrator.test.ts
git commit -m "refactor(pipeline): rewrite run-search.ts as stage orchestrator

Replaces 549-line monolith with ~80-line orchestrator that calls 5
discrete stages. Stage-level try/catch with warning accumulation.
Finalize always runs. Zero behavior changes to process-job caller.

Co-Authored-By: Neuridion"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: No uncommitted changes

- [ ] **Step 4: Verify process-job import still works**

Run: `grep -n "from '@/lib/pipeline/run-search'" app/api/worker/process-job/route.ts app/api/search-runs/route.ts app/api/search-runs/\[id\]/retry/route.ts`
Expected: All imports resolve (same path as before)

- [ ] **Step 5: Review commit log**

Run: `git log --oneline -8`
Expected: 7 commits covering types, 5 stages, and orchestrator rewrite

- [ ] **Step 6: Build check**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Push to remote**

```bash
git push origin main
```
