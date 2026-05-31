# Architecture Refactoring — 8-Item Structural Cleanup

> **Goal:** Eliminate stale types, duplicated logic, and oversized files across the Neuridion codebase. No functionality changes — only structure and quality improvements.

## Context

A 5-agent architecture audit identified 8 structural issues ranked P0–P2. All are internal code quality problems — no user-facing behavior changes.

### Root Causes

1. **Stale Supabase types** — Migrations 059 (search_runs soft delete) and 066 (product_profiles soft delete) added `deleted_at`/`deleted_by` columns. The `types/supabase.ts` file was never regenerated, causing 15 `as never` casts.
2. **Duplicated types** — `Profile`, `FsnResult`, `FilterDecision`, `FsnRow` interfaces defined independently in 4+ files.
3. **Duplicated utilities** — `escHtml` in 3 locations; `SOURCE_LABELS` + `fmtSourceDb` in 5 locations.
4. **Oversized files** — `search-panel.tsx` (1002 lines, 10+ functions); `reports/route.ts` (671 lines, mixed concerns).
5. **Duplicated retry logic** — Each scraper implements its own retry+backoff loop.
6. **No cron invocation** — Cleanup route exists but nothing calls it on a schedule.
7. **In-memory accumulation** — Pipeline collects all scraped items before inserting, risking OOM on large date ranges.

---

## Batch 1: Type Safety Foundation

### Task 1: Regenerate Supabase Types

**Current state:** `types/supabase.ts` (1045 lines) was generated before migrations 059 and 066. Missing columns on `search_runs` (`deleted_at`, `deleted_by`) and `product_profiles` (`deleted_at`).

**Action:**
1. Run `npx supabase gen types typescript --project-id <project-id> > types/supabase.ts`
2. Remove all 15 `as never` casts from:
   - `app/api/search-runs/route.ts:90`
   - `app/api/search-runs/[id]/route.ts:32, 139, 149`
   - `app/api/search-runs/[id]/cancel/route.ts:34`
   - `app/api/search-runs/[id]/retry/route.ts:37`
   - `app/api/search-runs/[id]/review/route.ts:55`
   - `app/api/profiles/route.ts:44`
   - `app/api/profiles/[id]/route.ts:75, 195, 204, 207`
   - `app/api/profiles/[id]/stats/route.ts:41`
   - `app/api/reports/route.ts:459`
   - `app/api/reports/[id]/download/route.ts:48`
3. Verify `npx tsc --noEmit` passes

### Task 2: Extract Shared Domain Types

**Create:** `lib/domain/types.ts`

Canonical type definitions extracted from existing files:

```typescript
// Search/filter types used across dashboard and API routes
export interface DeviceProfile {
  id: string
  device_name: string
  manufacturer: string
  intended_use: string | null
  emdn_code: string | null
  device_class: string | null
  search_strategy: {
    competitor_terms?: Array<{ name: string; manufacturer?: string }>
    strategy_doc_paths?: string[]
  } | null
}

export type FilterVerdict = 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'

export interface FilterDecision {
  decision: FilterVerdict
  rationale: string
  confidence: number | null
  model?: string | null
}

export interface FsnResult {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source_db: string
  filter_decision: FilterDecision | null
}
```

**Consumers updated:**
- `search-panel.tsx` — remove local `Profile`, `FilterDecision`, `FsnResult`, `FilterTab` interfaces
- `reports/route.ts` — remove local `FsnRow` (import `FsnResult` instead)
- `archive-table.tsx` — import shared types where applicable
- `pipeline/types.ts` — import `FilterDecision` from domain types (keep pipeline-specific types like `PipelineContext` in place)

### Task 3: Deduplicate escHtml and SOURCE_LABELS

**escHtml** — canonical source: `lib/utils/html.ts` (8 lines, already used by `email.ts` and `security-alerts.ts`)

Delete duplicate definitions from:
- `app/api/reports/route.ts:399-405` — replace with `import { escHtml } from '@/lib/utils/html'`
- `app/api/admin/trial-codes/[batch]/pdf/route.ts:6-12` — replace with same import

Note: the `reports/route.ts` version accepts `string | null | undefined` and returns `''` for nullish input. The canonical version only accepts `string`. Update canonical to handle nullish:

```typescript
export function escHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

**SOURCE_LABELS** — create `lib/domain/source-labels.ts`:

```typescript
export const SOURCE_LABELS: Record<string, string> = {
  bfarm:      'BfArM',
  maude:      'FDA MAUDE',
  fda:        'FDA MAUDE',
  mhra:       'MHRA',
  swissmedic: 'Swissmedic',
}

export function fmtSourceDb(src: string | null | undefined): string {
  if (!src) return 'BfArM'
  return SOURCE_LABELS[src.toLowerCase()] ?? src.toUpperCase()
}
```

Delete duplicate definitions from:
- `app/dashboard/archive/archive-table.tsx:80-93` — import `SOURCE_LABELS` and `fmtSourceDb`
- `app/api/reports/route.ts:37-45` — import from source-labels
- `lib/docx-report.ts:46-56` — import from source-labels
- `lib/pdf/report-document.tsx:53-60` — import from source-labels
- `app/dashboard/search/search-panel.tsx:61-71` (`formatSourceLabel`) — import `fmtSourceDb`

---

## Batch 2: Component Decomposition

### Task 4: Decompose search-panel.tsx (1002 lines)

All files stay in `app/dashboard/search/`. The parent `SearchPanel` passes state via props.

**File: `search-progress.tsx` (~180 lines)**
Extract components:
- `ElapsedTimer` (line 207) — countdown/elapsed display
- `RotatingTip` (line 220) — cycling UX tips during search
- `SearchProgressCard` (line 245) — full progress card with source status, cancel button

**File: `search-results.tsx` (~200 lines)**
Extract components:
- `FsnRow` (line 117) — individual FSN result row with expand/collapse
- Filter tabs UI (inline JSX in SearchPanel)
- `formatModelLabel` (line 992) — AI model display formatting
- `safeHref` (line 50) — URL sanitizer (or move to `lib/utils/html.ts`)

**File: `profile-preview.tsx` (~70 lines)**
Extract:
- `ProfilePreviewCard` (line 352) — device profile summary card

**File: `search-form.tsx` (~200 lines)**
Extract:
- Profile selector dropdown
- Date pickers (from/to)
- Database checkboxes with the `databases` constant (line 75)
- Draft save/load UI
- `toggleDb`, `toggleAll` helper functions

**File: `search-panel.tsx` (~350 lines)**
Keeps:
- `SearchPanel` component with state management
- Polling logic (`startPolling`, `stopPolling`)
- Form submission handler
- Layout composition importing above components

### Task 5: Extract Report Builders from reports/route.ts (671 lines)

**Create: `lib/reports/html-builder.ts` (~250 lines)**
- Move `buildReportHtml()` (line 179) — the main HTML template function
- Move `safeHref()` (line 408)
- Move `safeCell()` (line 54)
- Move `fmtDate()` (line 47)
- Move `DECISION_LABEL` constant (line 30)
- Import `escHtml` from `lib/utils/html`
- Import `fmtSourceDb` from `lib/domain/source-labels`

**Create: `lib/reports/excel-builder.ts` (~100 lines)**
- Extract Excel workbook generation logic (currently inline in the POST handler)
- Import `fmtSourceDb` from `lib/domain/source-labels`
- Import `DECISION_LABEL` from `html-builder` or extract to shared const

**Remaining: `app/api/reports/route.ts` (~150 lines)**
- POST handler: auth check, input validation, data fetching, format dispatch, audit logging
- Imports builders: `buildReportHtml`, `buildReportExcel`, `buildDocx`, `generateReportPdf`

### Task 6: Extract Shared Scraper Retry Logic

**Create: `lib/scrapers/fetch-with-retry.ts`**

```typescript
interface RetryOptions {
  maxAttempts?: number       // default: 3
  backoffs?: number[]        // default: [1000, 3000, 8000]
  retryOn429?: boolean       // default: true (FDA needs this)
  retryOnServerError?: boolean // default: true
  signal?: AbortSignal
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response>
```

**Update scrapers:**
- `fda-maude.ts` — replace `fetchPageWithRetry` (line 258, ~45 lines) with import
- `mhra.ts` — replace inline retry loop (~30 lines) with import
- `swissmedic.ts` — replace inline retry loop (~25 lines) with import
- `bfarm.ts` — leave as-is (HTML scraping has a different fetch pattern with pagination)

---

## Batch 3: Pipeline Reliability

### Task 7: Pipeline Heartbeat Cron

**Current state:** `app/api/worker/cleanup/route.ts` has complete orphan detection (`isStuckRun` with 20-minute threshold) and cleanup logic. But nothing invokes it automatically.

**Action:**
1. Add heartbeat progress update in the pipeline — during long scraper runs, update `search_runs.started_at` or a new `heartbeat_at` column periodically (every 5 minutes) so the 20-minute window stays accurate even for pipelines that legitimately run 10+ minutes.
2. Document Render Cron Job configuration: `POST /api/worker/cleanup` every 10 minutes with QStash signature verification.
3. Add a simple migration for `heartbeat_at` column on `search_runs` if needed, or repurpose the existing progress JSON column.

**Alternative (simpler):** Instead of a heartbeat column, increase the stuck threshold from 20 to 30 minutes (the max pipeline duration is ~13 minutes per `maxDuration = 800`). This means any run stuck for 30+ minutes is definitely orphaned. Then just set up the cron — no pipeline changes needed.

**Recommended:** The simpler approach. Set threshold to 30 minutes, configure cron to invoke cleanup every 10 minutes.

### Task 8: Stream Scraper Results to DB in Batches

**Current state:** `scrapeStage` in `lib/pipeline/stages/scrape.ts` runs all sources sequentially, accumulating results into `ctx.items[]`. After all sources finish, `insertResultsStage` bulk inserts everything.

**Action:** After each source completes in `scrapeStage`, immediately call `insertResultsStage` for that batch. This means:
1. `scrapeStage` becomes a loop that processes one source at a time
2. After each source: canonicalize, insert to DB, append to `ctx.insertedRows`
3. Clear `ctx.items` between sources to release memory
4. `insertResultsStage` is called per-source instead of once at the end
5. `filterStage` and `persistDecisionsStage` still run once after all sources complete

This caps memory usage at the size of the largest single source's results (typically BfArM at ~50-200 items for a 2-month window) instead of all sources combined.

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/domain/types.ts` | Canonical shared types (Profile, FsnResult, FilterDecision) |
| `lib/domain/source-labels.ts` | SOURCE_LABELS map + fmtSourceDb() |
| `app/dashboard/search/search-form.tsx` | Profile/date/DB selection form |
| `app/dashboard/search/search-progress.tsx` | Progress display components |
| `app/dashboard/search/search-results.tsx` | Results table + filter tabs |
| `app/dashboard/search/profile-preview.tsx` | Profile summary card |
| `lib/reports/html-builder.ts` | HTML report template builder |
| `lib/reports/excel-builder.ts` | Excel workbook builder |
| `lib/scrapers/fetch-with-retry.ts` | Generic retry+backoff fetch wrapper |

## Files Modified

| File | Change |
|------|--------|
| `types/supabase.ts` | Regenerated (full replace) |
| 15 API route files | Remove `as never` casts |
| `lib/utils/html.ts` | Accept `string \| null \| undefined` |
| `app/dashboard/search/search-panel.tsx` | Slim from 1002 to ~350 lines |
| `app/api/reports/route.ts` | Slim from 671 to ~150 lines |
| `app/dashboard/archive/archive-table.tsx` | Import shared labels |
| `lib/docx-report.ts` | Import shared labels |
| `lib/pdf/report-document.tsx` | Import shared labels |
| `lib/scrapers/fda-maude.ts` | Use fetchWithRetry |
| `lib/scrapers/mhra.ts` | Use fetchWithRetry |
| `lib/scrapers/swissmedic.ts` | Use fetchWithRetry |
| `lib/pipeline/stages/scrape.ts` | Insert per-source, clear items |
| `app/api/worker/cleanup/route.ts` | Threshold from 20→30 minutes |

## Verification

After each batch:
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — clean production build
3. Existing PRRC test suite (36/36) — no regressions
4. Search timing test (13/13) — no regressions
