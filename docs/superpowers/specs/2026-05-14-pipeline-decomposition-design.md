# Pipeline Decomposition Design Spec

**Date:** 2026-05-14
**Author:** Council-driven design (Product, Engineering, Security, Growth advocates)
**Priority:** #1 of 5 council recommendations

## Goal

Decompose `lib/pipeline/run-search.ts` (549 lines, single function) into discrete, independently testable pipeline stages. Same-process execution model — no infrastructure changes. Stage-level error isolation with degraded status propagation.

## Why

- The monolith is untestable: nested closures and shared mutable state prevent unit testing any stage in isolation.
- Partial failures are all-or-nothing: a BfArM detail fetch timeout kills a run that had 200 good FDA results.
- The 549-line function is the #1 maintenance risk — every bug fix touches the same file.
- Council consensus: this unblocks testability (recommendation #4), API route tests (recommendation #2), and future per-user concurrency (out of scope for this spec).

## Scope

**In scope:**
- Extract 5 stages into separate files under `lib/pipeline/stages/`
- Create shared types in `lib/pipeline/types.ts`
- Rewrite `run-search.ts` as a ~60-line orchestrator
- Stage-level try/catch with warning accumulation
- Zero behavior changes to the public API (`process-job/route.ts` import unchanged)

**Out of scope:**
- Per-user rate limiter queues (separate infrastructure work)
- Worker-per-stage architecture (future cycle)
- New DB tables or migrations
- Changes to `filter-pipeline.ts` or `rate-limiter.ts`

## File Structure

```
lib/pipeline/
  run-search.ts              -- Orchestrator (~60 lines)
  types.ts                   -- Shared types
  stages/
    scrape.ts                -- Scraper fan-out, dedup, canonical upsert, coverage merge
    insert-results.ts        -- Insert fsn_results rows
    filter.ts                -- Cache check, manufacturer pre-filter, AI filter, BfArM enrichment
    persist-decisions.ts     -- Insert filter_decisions rows
    finalize.ts              -- Counts, status update, audit log, email
```

## Shared Types (`types.ts`)

```typescript
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

  // Accumulated across stages
  items:           ScrapedFsn[]
  contentChanged:  Set<string>
  canonicalIds:    Map<string, string>
  insertedRows:    InsertedFsnRow[]
  decisions:       DecisionRow[]
  warnings:        string[]

  // Progress
  onProgress?:     (update: ProgressUpdate) => Promise<void>
}
```

## Stage Contracts

### `scrape.ts`

**Reads:** `ctx.payload`, `ctx.profile`, `ctx.searchTerms`, `ctx.activeSources`, `ctx.db`
**Writes:** `ctx.items`, `ctx.contentChanged`, `ctx.canonicalIds`, `ctx.warnings`
**Calls:** `ctx.onProgress` after each source completes

Contains the existing `processSource` logic: coverage cache check, scraper invocation, deduplication, canonical upsert, coverage merge. Uses `Promise.allSettled` for parallel source execution. Appends per-source warnings on failure.

### `insert-results.ts`

**Reads:** `ctx.items`, `ctx.canonicalIds`, `ctx.runId`, `ctx.db`
**Writes:** `ctx.insertedRows`

Inserts `fsn_results` rows. No-op if `ctx.items` is empty. Maps canonical IDs and content hashes.

### `filter.ts`

**Reads:** `ctx.insertedRows`, `ctx.profile`, `ctx.searchTerms`, `ctx.aiOptOut`, `ctx.contentChanged`, `ctx.db`
**Writes:** `ctx.decisions`

Full filter chain:
1. Batch cache lookup against `filter_decision_cache`
2. Manufacturer pre-filter (exclude obvious mismatches at 0.95 confidence)
3. AI filter via `stage1Filter()` with `pLimit(4)` concurrency
4. BfArM detail enrichment for uncertain items with `pLimit(2)`
5. GDPR `ai_opt_out` bypass (marks all as `filter_failed`)
6. Per-run item cap (`MAX_FILTER_ITEMS_PER_RUN`)

No-op if `ctx.insertedRows` is empty.

### `persist-decisions.ts`

**Reads:** `ctx.decisions`, `ctx.runId`, `ctx.db`
**Writes:** Nothing (DB side effect only)

Batch inserts into `filter_decisions` table. No-op if `ctx.decisions` is empty.

### `finalize.ts`

**Reads:** `ctx.decisions`, `ctx.warnings`, `ctx.items`, `ctx.insertedRows`, `ctx.runId`, `ctx.payload`, `ctx.profile`, `ctx.db`
**Writes:** DB updates to `search_runs`, audit log, email (fire-and-forget)

Computes decision counts. Sets run status: `complete` (no warnings), `degraded` (some warnings), or `error` (all sources failed and no items). Writes audit log. Sends email notification for paid plans.

## Orchestrator (`run-search.ts`)

```typescript
export async function runSearchPipeline(
  runId: string,
  payload: SearchJobPayload,
  onProgress?: (update: ProgressUpdate) => Promise<void>,
): Promise<void> {
  const db = createAdminClient()

  // Pre-stage setup: fetch profile, check ai_opt_out, compute search terms
  const profile = await fetchProfile(db, payload.profile_id)
  const aiOptOut = await checkAiOptOut(db, payload.user_id)
  const searchTerms = buildManufacturerSearchTerms(profile.manufacturer, profile.device_name)
  const activeSources = payload.selected_dbs.filter(id => SCRAPERS[id])
  if (activeSources.length === 0) activeSources.push('bfarm')

  await persistTermsUsed(db, runId, profile, searchTerms)

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

  // Finalize always runs
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

## Error Model

- Each stage (scrape, insert, filter, persist) is wrapped in try/catch by the orchestrator.
- On stage failure: warning appended, pipeline continues. Downstream stages handle empty inputs gracefully (no-op patterns).
- Finalize runs unconditionally — it reads whatever state accumulated and sets the appropriate status.
- If ALL sources failed in scrape AND no items exist, finalize sets status `error`.
- If some sources failed or any stage produced warnings, finalize sets status `degraded`.
- If finalize itself fails, the orchestrator's outer catch sets run to `error` — last resort.

## What Doesn't Change

- `process-job/route.ts` — imports `runSearchPipeline` from `@/lib/pipeline/run-search` (same path)
- `filter-pipeline.ts` — untouched, `filter.ts` stage calls `stage1Filter()` from it
- `rate-limiter.ts` — stays process-scoped (concurrency fix is a separate cycle)
- Progress callback contract — same shape, called from scrape stage
- All DB tables and columns — no migrations needed
- `TermsUsedSchema` — stays in `run-search.ts`, used in pre-stage setup
- `SCRAPERS` registry — stays in `run-search.ts`, used to validate `activeSources`; `scrape.ts` receives the validated source list via `ctx.activeSources` and imports scraper functions directly
- `shouldBypassCoverageCache()` — moves to `stages/scrape.ts` (only used there)

## Testing Strategy

Each stage file can be unit tested by constructing a `PipelineContext` with mock data:

- `scrape.ts` — mock scrapers, verify items + dedup + warnings
- `insert-results.ts` — mock `db.from('fsn_results').insert()`, verify row mapping
- `filter.ts` — mock `stage1Filter()`, verify cache/pre-filter/AI decision flow
- `persist-decisions.ts` — mock `db.from('filter_decisions').insert()`, verify batch shape
- `finalize.ts` — mock DB update, verify status logic (complete vs degraded vs error)

The orchestrator itself can be tested by mocking all 5 stage functions and verifying: stage execution order, error accumulation, and finalize always runs.
