# Architecture Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate stale Supabase types, duplicated logic, and oversized files — 8 structural improvements with zero functionality changes.

**Architecture:** Three sequential batches: (1) Type Safety Foundation — regenerate types, extract shared domain types, deduplicate utilities. (2) Component Decomposition — split search-panel.tsx and reports/route.ts into focused files, extract shared scraper retry logic. (3) Pipeline Reliability — configure cleanup cron, stream scraper results to DB per-source.

**Tech Stack:** Next.js 16, TypeScript, Supabase CLI, ExcelJS, docx, @react-pdf/renderer

---

## File Structure

### Files to Create

| File | Purpose |
|------|---------|
| `lib/domain/types.ts` | Canonical shared types: `FilterVerdict`, `FilterDecision`, `FsnReportRow` |
| `lib/domain/source-labels.ts` | `SOURCE_LABELS` map + `fmtSourceDb()` — single source of truth for all report builders and UI |
| `lib/reports/html-builder.ts` | `buildReportHtml()` + helpers extracted from `reports/route.ts` |
| `lib/reports/excel-builder.ts` | `buildExcel()` extracted from `reports/route.ts` |
| `lib/reports/shared.ts` | `DECISION_LABEL`, `fmtDate`, `safeCell`, `safeHref` — shared by HTML and Excel builders |
| `app/dashboard/search/search-progress.tsx` | `ElapsedTimer`, `RotatingTip`, `SearchProgressCard` |
| `app/dashboard/search/search-results.tsx` | `FsnRow`, filter tabs, results section, `formatModelLabel` |
| `app/dashboard/search/profile-preview.tsx` | `ProfilePreviewCard` |
| `lib/scrapers/fetch-with-retry.ts` | Generic retry+backoff fetch wrapper |

### Files to Modify

| File | Change |
|------|--------|
| `types/supabase.ts` | Regenerated via Supabase CLI |
| `lib/utils/html.ts` | Widen `escHtml` signature to accept `string \| null \| undefined` |
| 15 API route files | Remove `as never` casts |
| `app/dashboard/search/search-panel.tsx` | Remove extracted components, import from new files |
| `app/api/reports/route.ts` | Remove `buildReportHtml`, `buildExcel`, import from `lib/reports/` |
| `app/api/admin/trial-codes/[batch]/pdf/route.ts` | Delete inline `escHtml`, import from `lib/utils/html` |
| `app/dashboard/archive/archive-table.tsx` | Replace `DB_LABELS` with import from `lib/domain/source-labels` |
| `lib/docx-report.ts` | Replace `SOURCE_LABELS`/`fmtSource` with import from `lib/domain/source-labels` |
| `lib/pdf/report-document.tsx` | Replace `SOURCE_LABELS`/`fmtSourceDb` with import from `lib/domain/source-labels` |
| `lib/scrapers/fda-maude.ts` | Replace `fetchPageWithRetry` with import |
| `lib/scrapers/mhra.ts` | Replace `fetchJson` with `fetchWithRetry` |
| `lib/scrapers/swissmedic.ts` | Replace inline retry loop with `fetchWithRetry` |
| `lib/pipeline/stages/scrape.ts` | Insert results per-source instead of accumulating |
| `lib/pipeline/run-search.ts` | Remove `insertResultsStage` from sequential stage list |
| `app/api/worker/cleanup/route.ts` | Change stuck threshold from 20 to 30 minutes |

---

## Batch 1: Type Safety Foundation

### Task 1: Regenerate Supabase Types

**Files:**
- Modify: `types/supabase.ts` (full replace)

- [ ] **Step 1: Check current Supabase project ID**

Run this to find your project reference (the subdomain from `NEXT_PUBLIC_SUPABASE_URL`):

```bash
grep NEXT_PUBLIC_SUPABASE_URL .env.local | grep -oP 'https://\K[^.]+'
```

Note: if this fails, open `.env.local` and find the URL like `https://XXXXX.supabase.co` — `XXXXX` is the project ID.

- [ ] **Step 2: Regenerate types**

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts
```

Replace `YOUR_PROJECT_ID` with the value from step 1.

- [ ] **Step 3: Verify the new types include deleted_at on search_runs and product_profiles**

```bash
grep -A 3 "deleted_at" types/supabase.ts | head -20
```

Expected: `deleted_at` appears in `search_runs` Row/Insert/Update AND `product_profiles` Row/Insert/Update sections (not just in `users`).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: May show new type errors where `as never` casts now conflict with the correct types. That's expected — we fix those in Task 2.

- [ ] **Step 5: Commit**

```bash
git add types/supabase.ts
git commit -m "chore: regenerate Supabase types (includes soft-delete columns)"
```

---

### Task 2: Remove `as never` Type Casts

**Files:**
- Modify: `app/api/search-runs/route.ts:90`
- Modify: `app/api/search-runs/[id]/route.ts:32, 139, 149`
- Modify: `app/api/search-runs/[id]/cancel/route.ts:34`
- Modify: `app/api/search-runs/[id]/retry/route.ts:37`
- Modify: `app/api/search-runs/[id]/review/route.ts:55`
- Modify: `app/api/profiles/route.ts:44`
- Modify: `app/api/profiles/[id]/route.ts:75, 195, 204, 207`
- Modify: `app/api/profiles/[id]/stats/route.ts:41`
- Modify: `app/api/reports/route.ts:459`
- Modify: `app/api/reports/[id]/download/route.ts:48`

- [ ] **Step 1: Remove all `as never` casts**

In every file listed above, change patterns like:

```typescript
// BEFORE:
.is('deleted_at' as never, null)
// AFTER:
.is('deleted_at', null)

// BEFORE:
.update({ deleted_at: new Date().toISOString(), deleted_by: user.id } as never)
// AFTER:
.update({ deleted_at: new Date().toISOString(), deleted_by: user.id })

// BEFORE:
.update({ deleted_at: new Date().toISOString() } as never)
// AFTER:
.update({ deleted_at: new Date().toISOString() })
```

There are exactly 15 occurrences. Find them all:

```bash
grep -rn "as never" app/ lib/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Verify no `as never` casts remain**

```bash
grep -rn "as never" app/ lib/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected: `0`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Zero errors. If there are new type errors, they indicate the regenerated types have slightly different shapes for these columns. Fix by adjusting the update objects to match the new types (should be straightforward — the types now correctly include `deleted_at` and `deleted_by`).

- [ ] **Step 4: Commit**

```bash
git add app/api/search-runs/ app/api/profiles/ app/api/reports/
git commit -m "refactor: remove 15 'as never' casts now that Supabase types include soft-delete columns"
```

---

### Task 3: Widen `escHtml` Signature and Deduplicate

**Files:**
- Modify: `lib/utils/html.ts`
- Modify: `app/api/reports/route.ts:399-406`
- Modify: `app/api/admin/trial-codes/[batch]/pdf/route.ts:6-8`

- [ ] **Step 1: Update `lib/utils/html.ts` to accept nullish input**

Replace the entire file content:

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

- [ ] **Step 2: Delete the duplicate `escHtml` from `app/api/reports/route.ts`**

Remove lines 399-406 (the `escHtml` function) and add an import at the top of the file:

```typescript
import { escHtml } from '@/lib/utils/html'
```

- [ ] **Step 3: Delete the duplicate `escHtml` from `app/api/admin/trial-codes/[batch]/pdf/route.ts`**

Remove lines 6-8:

```typescript
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

Add an import at the top:

```typescript
import { escHtml } from '@/lib/utils/html'
```

- [ ] **Step 4: Verify no duplicate definitions remain**

```bash
grep -rn "function escHtml" app/ lib/ --include="*.ts" --include="*.tsx"
```

Expected: Only one result — `lib/utils/html.ts:1`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/html.ts app/api/reports/route.ts app/api/admin/trial-codes/
git commit -m "refactor: deduplicate escHtml — single source of truth in lib/utils/html"
```

---

### Task 4: Extract `SOURCE_LABELS` and `fmtSourceDb` to Shared Module

**Files:**
- Create: `lib/domain/source-labels.ts`
- Modify: `app/dashboard/archive/archive-table.tsx:80-93`
- Modify: `app/api/reports/route.ts:37-45`
- Modify: `lib/docx-report.ts:46-57`
- Modify: `lib/pdf/report-document.tsx:53-61`
- Modify: `app/dashboard/search/search-panel.tsx:59-71`

- [ ] **Step 1: Create `lib/domain/source-labels.ts`**

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

- [ ] **Step 2: Update `app/dashboard/archive/archive-table.tsx`**

Add import at the top:

```typescript
import { SOURCE_LABELS, fmtSourceDb } from '@/lib/domain/source-labels'
```

Delete lines 80-93 (the local `DB_LABELS` constant and `getDbsLabel` function). Replace `getDbsLabel` with a new inline version that uses the shared import:

```typescript
function getDbsLabel(dbs: unknown): string {
  if (!dbs) return '—'
  const arr = Array.isArray(dbs) ? dbs : typeof dbs === 'string' ? [dbs] : []
  if (arr.length === 0) return '—'
  return arr.map((d) => fmtSourceDb(String(d))).join(', ')
}
```

- [ ] **Step 3: Update `app/api/reports/route.ts`**

Add import at the top:

```typescript
import { fmtSourceDb } from '@/lib/domain/source-labels'
```

Delete lines 37-45 (the local `SOURCE_LABELS` constant and `fmtSourceDb` function).

- [ ] **Step 4: Update `lib/docx-report.ts`**

Add import at the top:

```typescript
import { fmtSourceDb } from '@/lib/domain/source-labels'
```

Delete lines 46-56 (the local `SOURCE_LABELS` constant and `fmtSource` function).

Replace all occurrences of `fmtSource(` with `fmtSourceDb(` in this file:

```bash
grep -n "fmtSource(" lib/docx-report.ts
```

There are references at lines 115 and 154. Change `fmtSource(` to `fmtSourceDb(` in both.

- [ ] **Step 5: Update `lib/pdf/report-document.tsx`**

Add import at the top:

```typescript
import { fmtSourceDb } from '@/lib/domain/source-labels'
```

Delete lines 53-61 (the local `SOURCE_LABELS` constant and `fmtSourceDb` function).

- [ ] **Step 6: Update `app/dashboard/search/search-panel.tsx`**

Add import at the top:

```typescript
import { fmtSourceDb } from '@/lib/domain/source-labels'
```

Delete lines 59-71 (the `// ─── Source label formatter` section including `formatSourceLabel`).

Replace all occurrences of `formatSourceLabel(` with `fmtSourceDb(` in this file. There are two occurrences:
- Line 143: `{formatSourceLabel(result.source)}` → `{fmtSourceDb(result.source)}`
- Line 300: `{formatSourceLabel(sourceId)}` → `{fmtSourceDb(sourceId)}`

- [ ] **Step 7: Verify no duplicate definitions remain**

```bash
grep -rn "SOURCE_LABELS\|DB_LABELS\|fmtSourceDb\|fmtSource\|formatSourceLabel" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "import.*from"
```

Expected: Only `lib/domain/source-labels.ts` defines `SOURCE_LABELS` and `fmtSourceDb`. Other files only have `import` statements or usage calls.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 9: Commit**

```bash
git add lib/domain/source-labels.ts app/dashboard/archive/archive-table.tsx app/api/reports/route.ts lib/docx-report.ts lib/pdf/report-document.tsx app/dashboard/search/search-panel.tsx
git commit -m "refactor: deduplicate SOURCE_LABELS — single source of truth in lib/domain/source-labels"
```

---

### Task 5: Extract Shared Domain Types

**Files:**
- Create: `lib/domain/types.ts`
- Modify: `app/dashboard/search/search-panel.tsx:18-48`
- Modify: `lib/pipeline/types.ts:4`

- [ ] **Step 1: Create `lib/domain/types.ts`**

```typescript
export type FilterVerdict = 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'

export interface FilterDecision {
  decision: FilterVerdict
  rationale: string
  confidence: number | null
  model?: string | null
}

export interface FsnReportRow {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source_db: string
  filter_decision: Omit<FilterDecision, 'model'> | null
}
```

Note: We intentionally do NOT extract `Profile` from `search-panel.tsx` yet. The search panel's `Profile` type includes `search_strategy` with `strategy_doc_paths` which is UI-specific. The `FsnResult` in search-panel uses `source` (not `source_db`) because it comes from a different API response shape. Forcing unification would require changing API contracts — out of scope for a structural refactor.

We do extract `FsnReportRow` (the shape used by all report builders: HTML, Excel, Word, PDF) and `FilterDecision`/`FilterVerdict` (used everywhere).

- [ ] **Step 2: Update `app/api/reports/route.ts` to use shared types**

Add import:

```typescript
import type { FsnReportRow, FilterDecision } from '@/lib/domain/types'
```

Delete the local `FsnRow` interface (lines 14-26). Rename all usages of `FsnRow` to `FsnReportRow` in this file.

- [ ] **Step 3: Update `lib/docx-report.ts` to use shared types**

Add import:

```typescript
import type { FsnReportRow } from '@/lib/domain/types'
```

Delete the local `FsnRow` interface (lines 8-20). Rename all usages of `FsnRow` to `FsnReportRow` in this file.

- [ ] **Step 4: Update `lib/pdf/report-document.tsx` to use shared types**

Add import:

```typescript
import type { FsnReportRow } from '@/lib/domain/types'
```

Delete the local `FsnRow` interface (lines 18-30) and the local `export interface FsnRow`. Update the `ReportData` interface to use `FsnReportRow`:

```typescript
export interface ReportData {
  profile: {
    device_name: string
    manufacturer: string
    device_class: string | null
    emdn_code: string | null
  }
  run: { period_from: string; period_to: string }
  rows: FsnReportRow[]
  runId: string
}
```

Delete the local `DECISION_LABEL` constant (lines 46-51) — this will be imported from a shared module in Task 7.

- [ ] **Step 5: Update `lib/pipeline/types.ts` to re-use `FilterDecision`**

Add import:

```typescript
import type { FilterDecision } from '@/lib/domain/types'
```

Delete the local `FilterDecision` import from `@/lib/claude/filter-pipeline` (line 4) if it's identical. Check first:

```bash
grep -A 5 "export interface FilterDecision" lib/claude/filter-pipeline.ts
```

If the pipeline's `FilterDecision` has a different shape (e.g. extra fields), keep the pipeline import and only use the domain type in report builders.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/types.ts app/api/reports/route.ts lib/docx-report.ts lib/pdf/report-document.tsx lib/pipeline/types.ts
git commit -m "refactor: extract shared domain types (FsnReportRow, FilterDecision, FilterVerdict)"
```

---

## Batch 2: Component Decomposition

### Task 6: Extract Search Progress Components

**Files:**
- Create: `app/dashboard/search/search-progress.tsx`
- Modify: `app/dashboard/search/search-panel.tsx`

- [ ] **Step 1: Create `app/dashboard/search/search-progress.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { CheckCircle, Loader2, Square } from 'lucide-react'
import type { SearchProgress } from '../search-context'
import { fmtSourceDb } from '@/lib/domain/source-labels'

const PROGRESS_TIPS = [
  'Scanning Field Safety Notices issued in your selected period',
  'Cross-referencing manufacturer aliases and trade name variants',
  'Applying 2-stage AI relevance filter using Claude Sonnet',
  'Checking EU MDR compliance signals across regulatory databases',
  'Deduplicating FSN records to prevent double-counting across sources',
  'Comparing notices against your device EMDN classification',
  'Identifying Field Safety Corrective Actions relevant to your profile',
  'Filtering by manufacturer name variants and legal entity suffixes',
]

export function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000))
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <span>{m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`}</span>
}

export function RotatingTip() {
  const [idx, setIdx]         = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setVisible(false), 4000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => { setIdx((i) => (i + 1) % PROGRESS_TIPS.length); setVisible(true) }, 300)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <p className="text-xs text-[#0D9488] italic transition-opacity duration-300" style={{ opacity: visible ? 1 : 0 }}>
      {PROGRESS_TIPS[idx]}
    </p>
  )
}

export function SearchProgressCard({ startedAt, progress, onCancel }: { startedAt: number; progress: SearchProgress | null; onCancel: () => void }) {
  return (
    <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-[#0F1F3D] to-[#0a2e2b] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
          </span>
          <span className="text-sm font-medium text-white truncate">Searching databases…</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[#0D9488] font-mono tabular-nums">
            <ElapsedTimer startedAt={startedAt} />
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-red-300 hover:text-white hover:bg-red-600/30 transition-colors"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        </div>
      </div>

      {/* Indeterminate progress bar */}
      <div className="h-0.5 bg-[#CCFBF1] overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-[#0D9488] to-[#14b8a6] animate-[slide_2s_ease-in-out_infinite]" />
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {progress && progress.sources_total.length > 0 ? (
          <div className="space-y-2">
            {progress.sources_total.map((sourceId) => {
              const isDone   = progress.sources_done.includes(sourceId)
              const allScrapingDone = progress.sources_done.length >= progress.sources_total.length
              const isActive = !isDone && !allScrapingDone
              return (
                <div key={sourceId} className="flex items-center gap-2.5">
                  {isDone  && <CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />}
                  {isActive && <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />}
                  {!isDone && !isActive && (
                    <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </span>
                  )}
                  <span className={clsx(
                    'text-sm',
                    isDone    ? 'text-[#0F766E]'
                    : isActive ? 'text-[#0F1F3D] font-medium'
                    :            'text-[#0D9488]'
                  )}>
                    {fmtSourceDb(sourceId)}
                  </span>
                  {isActive && (
                    <span className="text-xs text-teal-600 font-medium ml-auto">scanning…</span>
                  )}
                </div>
              )
            })}

            {progress.sources_done.length >= progress.sources_total.length && (
              <div className="flex items-center gap-2.5 pt-1">
                <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm text-[#0F1F3D] font-medium">Running AI relevance filter…</span>
                  {progress.filter_progress && (
                    <span className="text-xs text-teal-600">
                      {progress.filter_progress.done}/{progress.filter_progress.total} analyzed
                      {progress.filter_progress.cached > 0 && ` (${progress.filter_progress.cached} cached)`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {progress.items_found > 0 && (
              <p className="text-xs text-[#0D9488] pt-1 border-t border-[#CCFBF1]">
                {progress.items_found} item{progress.items_found !== 1 ? 's' : ''} found so far
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[#0F766E]">
            <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
            <span>{progress ? 'Running AI relevance filter…' : 'Starting search…'}</span>
          </div>
        )}

        <div className="flex items-start gap-2 pt-1 border-t border-[#CCFBF1]">
          <svg className="w-3.5 h-3.5 text-[#0D9488] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <RotatingTip />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remove extracted code from `search-panel.tsx`**

Delete the following sections from `search-panel.tsx`:
- Lines 192-204: `PROGRESS_TIPS` array
- Lines 205-216: `ElapsedTimer` component
- Lines 218-241: `RotatingTip` component
- Lines 243-348: `SearchProgressCard` component

Add import at the top:

```typescript
import { SearchProgressCard } from './search-progress'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/search/search-progress.tsx app/dashboard/search/search-panel.tsx
git commit -m "refactor: extract search progress components to search-progress.tsx"
```

---

### Task 7: Extract Search Results Components

**Files:**
- Create: `app/dashboard/search/search-results.tsx`
- Modify: `app/dashboard/search/search-panel.tsx`

- [ ] **Step 1: Create `app/dashboard/search/search-results.tsx`**

```tsx
'use client'

import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import { fmtSourceDb } from '@/lib/domain/source-labels'

interface FilterDecision {
  decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale: string
  confidence: number | null
  model: string | null
}

interface FsnResult {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source: string
  filter_decision: FilterDecision | null
}

function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

const DOT_COLORS: Record<string, string> = {
  relevant:      '#22c55e',
  uncertain:     '#f59e0b',
  excluded:      '#9ca3af',
  filter_failed: '#ef4444',
}

const BADGE_STYLES: Record<string, string> = {
  relevant:      'bg-green-50 text-green-700 border-green-200',
  uncertain:     'bg-amber-50 text-amber-700 border-amber-200',
  excluded:      'bg-zinc-100 text-zinc-500 border-zinc-200',
  filter_failed: 'bg-red-50 text-red-700 border-red-200',
}

const PANEL_STYLES: Record<string, string> = {
  relevant:      'bg-green-50 border-green-200',
  uncertain:     'bg-amber-50 border-amber-200',
  excluded:      'bg-zinc-50 border-zinc-200',
  filter_failed: 'bg-red-50 border-red-200',
}

function formatModelLabel(model: string | null | undefined): string {
  if (!model) return 'AI-assisted'
  const MODEL_NAMES: Record<string, string> = {
    'claude-sonnet-4-5': 'Sonnet 4.5',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-haiku-4-5':  'Haiku 4.5',
  }
  return MODEL_NAMES[model] ?? model
}

export function FsnRow({
  result, expanded, onToggle, badgeLabels,
}: {
  result: FsnResult
  expanded: boolean
  onToggle: () => void
  badgeLabels: Record<string, string>
}) {
  const d = result.filter_decision
  const dotColor = d ? (DOT_COLORS[d.decision] ?? '#9ca3af') : '#9ca3af'

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-zinc-50 transition-colors"
        onClick={onToggle}
      >
        <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <a href={safeHref(result.source_url)} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-zinc-900 hover:text-[#0D9488] hover:underline line-clamp-2">
              {result.title}
            </a>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500">
              {fmtSourceDb(result.source)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {result.manufacturer && <span>{result.manufacturer}</span>}
              {result.fsn_date && (
                <span>{new Date(result.fsn_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              )}
            </div>
            {d && (
              <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[d.decision] ?? ''}`}>
                {badgeLabels[d.decision] ?? d.decision}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={clsx('w-4 h-4 text-zinc-400 shrink-0 mt-1 transition-transform duration-150', expanded && 'rotate-180')} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 ml-5">
          <div className={clsx('rounded border p-3 text-sm', d ? PANEL_STYLES[d.decision] : 'bg-zinc-50 border-zinc-200')}>
            {!d && <p className="text-xs text-zinc-500 italic">No AI assessment available for this item.</p>}
            {d?.decision === 'filter_failed' && (
              <p className="text-xs font-medium text-amber-700">Not reviewed — manual review required.</p>
            )}
            {d && d.decision !== 'filter_failed' && (
              <>
                <p className="text-xs font-semibold text-zinc-600 mb-1">AI Assessment</p>
                <p className="text-xs text-zinc-700 leading-relaxed">{d.rationale}</p>
              </>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
              {d?.confidence != null && <span title="How certain the AI is that this classification is correct">Confidence: {Math.round(d.confidence * 100)}%</span>}
              {d?.model && <span>{formatModelLabel(d.model)}</span>}
              <a href={safeHref(result.source_url)} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[#0D9488] hover:underline text-xs">
                View source ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Remove extracted code from `search-panel.tsx`**

Delete from `search-panel.tsx`:
- Lines 50-57: `safeHref` function
- Lines 92-113: `DOT_COLORS`, `BADGE_STYLES`, `PANEL_STYLES` constants
- Lines 115-190: `FsnRow` component
- Lines 992-1002: `formatModelLabel` function and `MODEL_LABEL` constant

Add imports at the top:

```typescript
import { FsnRow } from './search-results'
```

Keep `MODEL_LABEL` as a local constant in `search-panel.tsx` (it's used in the results summary bar at line 943). Or move it inline:

```typescript
// At line 943, replace:
<span className="text-xs text-zinc-400 ml-auto">AI-filtered · {MODEL_LABEL}</span>
// Keep MODEL_LABEL = 'AI-assisted' as a local const in search-panel.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/search/search-results.tsx app/dashboard/search/search-panel.tsx
git commit -m "refactor: extract FsnRow and result display to search-results.tsx"
```

---

### Task 8: Extract Profile Preview Card

**Files:**
- Create: `app/dashboard/search/profile-preview.tsx`
- Modify: `app/dashboard/search/search-panel.tsx`

- [ ] **Step 1: Create `app/dashboard/search/profile-preview.tsx`**

```tsx
'use client'

interface Profile {
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

export function ProfilePreviewCard({ profile }: { profile: Profile }) {
  const competitorCount = profile.search_strategy?.competitor_terms?.filter(c => c.name?.trim()).length ?? 0
  const docCount = profile.search_strategy?.strategy_doc_paths?.length ?? 0

  return (
    <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#0F1F3D] truncate">
            {profile.device_name} — {profile.manufacturer}
          </h3>
          <div className="mt-2 space-y-1">
            {profile.intended_use && (
              <p className="text-xs text-[#134E4A] line-clamp-2">{profile.intended_use}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#0F766E]">
              {profile.device_class && <span>{profile.device_class}</span>}
              {profile.emdn_code && <span>EMDN: {profile.emdn_code}</span>}
              {competitorCount > 0 && (
                <span>{competitorCount} competitor{competitorCount !== 1 ? 's' : ''} monitored</span>
              )}
              {docCount > 0 && (
                <span>{docCount} strategy doc{docCount !== 1 ? 's' : ''} attached</span>
              )}
            </div>
          </div>
        </div>
        <a
          href={`/dashboard/profiles/${profile.id}/edit`}
          className="shrink-0 text-xs font-medium text-[#0D9488] hover:underline"
        >
          Edit →
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remove extracted code from `search-panel.tsx`**

Delete lines 350-388 (`ProfilePreviewCard` component) from `search-panel.tsx`.

Add import:

```typescript
import { ProfilePreviewCard } from './profile-preview'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/search/profile-preview.tsx app/dashboard/search/search-panel.tsx
git commit -m "refactor: extract ProfilePreviewCard to profile-preview.tsx"
```

---

### Task 9: Extract Report Builders from reports/route.ts

**Files:**
- Create: `lib/reports/shared.ts`
- Create: `lib/reports/html-builder.ts`
- Create: `lib/reports/excel-builder.ts`
- Modify: `app/api/reports/route.ts`

- [ ] **Step 1: Create `lib/reports/shared.ts`**

```typescript
import { fmtSourceDb } from '@/lib/domain/source-labels'

export { fmtSourceDb }

export const DECISION_LABEL: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Further Review',
  excluded:      'Not Relevant',
  filter_failed: 'AI Filter Unavailable',
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function safeCell(val: string | null | undefined): string {
  if (!val) return ''
  const stripped = val.replace(/^[﻿​ ]+/, '')
  if (/^[=+\-@\t\r|]/.test(stripped)) return "'" + stripped
  return stripped
}

export function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}
```

- [ ] **Step 2: Create `lib/reports/html-builder.ts`**

Move the `buildReportHtml` function (lines 179-397 of `app/api/reports/route.ts`) into this file. The complete file content:

```typescript
import { escHtml } from '@/lib/utils/html'
import { fmtSourceDb } from '@/lib/domain/source-labels'
import { DECISION_LABEL, fmtDate, safeHref } from './shared'
import type { FsnReportRow } from '@/lib/domain/types'

export function buildReportHtml(
  profile: { device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null },
  run: { period_from: string; period_to: string; status?: string; dbs_searched?: string[] | null },
  rows: FsnReportRow[],
  runId: string,
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
  extra?: { aiModels?: string[]; reviewerName?: string | null; reviewedAt?: string | null },
): string {
  // ... paste lines 187-397 from the original reports/route.ts
  // (the full function body — this is the biggest block)
```

Important: copy the ENTIRE function body from `app/api/reports/route.ts` lines 187-397 verbatim. The function uses `escHtml`, `fmtSourceDb`, `fmtDate`, `safeHref`, and `DECISION_LABEL` — all imported from the shared modules.

- [ ] **Step 3: Create `lib/reports/excel-builder.ts`**

Move the `buildExcel` function (lines 63-175 of `app/api/reports/route.ts`) into this file:

```typescript
import ExcelJS from 'exceljs'
import { DECISION_LABEL, fmtDate, safeCell } from './shared'
import type { FsnReportRow } from '@/lib/domain/types'

export async function buildExcel(
  rows: FsnReportRow[],
  meta: { device: string; manufacturer: string; period_from: string; period_to: string },
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
): Promise<Buffer> {
  // ... paste lines 68-175 from the original reports/route.ts verbatim
```

Important: copy the ENTIRE function body from lines 68-175 verbatim.

- [ ] **Step 4: Slim down `app/api/reports/route.ts`**

Remove from `app/api/reports/route.ts`:
- Lines 14-26: `FsnRow` interface (already removed in Task 5)
- Lines 30-58: `DECISION_LABEL`, `SOURCE_LABELS`, `fmtSourceDb`, `fmtDate`, `safeCell` (already removed in Tasks 3-5)
- Lines 63-175: `buildExcel` function
- Lines 179-397: `buildReportHtml` function
- Lines 399-415: `escHtml`, `safeHref` (already removed in Task 3)

Add imports at the top:

```typescript
import { buildReportHtml } from '@/lib/reports/html-builder'
import { buildExcel } from '@/lib/reports/excel-builder'
import type { FsnReportRow } from '@/lib/domain/types'
```

The remaining `app/api/reports/route.ts` should contain only:
- Imports
- `maxDuration` export
- The `POST` handler function (lines 419-671)

Update the `rows` variable type from `FsnRow[]` to `FsnReportRow[]` (around line 527).

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verify production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/reports/ app/api/reports/route.ts
git commit -m "refactor: extract report builders (HTML, Excel) from reports route — 671 to ~150 lines"
```

---

### Task 10: Extract Shared Scraper Retry Logic

**Files:**
- Create: `lib/scrapers/fetch-with-retry.ts`
- Modify: `lib/scrapers/mhra.ts:181-236`
- Modify: `lib/scrapers/swissmedic.ts:130-184`

Note: FDA MAUDE's `fetchPageWithRetry` has a unique return type (`FetchResult` discriminated union with `ok/retriable/data` fields) that doesn't fit a generic wrapper. Leave it as-is. MHRA and Swissmedic have nearly identical patterns that do fit.

- [ ] **Step 1: Create `lib/scrapers/fetch-with-retry.ts`**

```typescript
interface RetryOptions {
  maxAttempts?: number
  backoffs?: number[]
  timeoutMs?: number
  headers?: Record<string, string>
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? 3
  const backoffs = opts?.backoffs ?? [1_000, 2_000, 4_000]
  const timeoutMs = opts?.timeoutMs ?? 30_000
  let lastError = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const existing = init?.signal
    if (existing) {
      existing.addEventListener('abort', () => controller.abort(existing.reason))
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })

      if (res.ok) return res

      if (res.status >= 500 && attempt < maxAttempts - 1) {
        lastError = `HTTP ${res.status}`
        clearTimeout(timeout)
        await new Promise(r => setTimeout(r, backoffs[attempt]))
        continue
      }

      return res
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < maxAttempts - 1) {
        clearTimeout(timeout)
        await new Promise(r => setTimeout(r, backoffs[attempt]))
        continue
      }
      throw new Error(`Fetch failed after ${maxAttempts} attempts for ${url}: ${lastError}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(`All ${maxAttempts} attempts exhausted for ${url}: ${lastError}`)
}
```

- [ ] **Step 2: Update `lib/scrapers/mhra.ts`**

Add import:

```typescript
import { fetchWithRetry } from './fetch-with-retry'
```

Replace the `fetchJson` function (lines 181-236) with:

```typescript
async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })

    if (!res.ok) {
      console.error(`[mhra] HTTP ${res.status} ${url}`)
      return null
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('json')) {
      console.error(`[mhra] Unexpected content type from ${url}: ${contentType}`)
      return null
    }
    const text = await res.text()
    if (text.length > 5 * 1024 * 1024) {
      console.error(`[mhra] Response too large from ${url}: ${text.length} bytes`)
      return null
    }
    return JSON.parse(text)
  } catch (err) {
    console.error(`[mhra] Fetch failed: ${url}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
```

- [ ] **Step 3: Update `lib/scrapers/swissmedic.ts`**

Add import:

```typescript
import { fetchWithRetry } from './fetch-with-retry'
```

Replace the inline retry loop in the `fetchPage` function (approximately lines 130-184) with:

```typescript
async function fetchPage(url: string, params: ScraperParams, pageNumber: number): Promise<SwissmedicPage | null> {
  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    })

    if (!res.ok) {
      console.error('[swissmedic]', `HTTP ${res.status} ${url}`)
      return null
    }

    return await res.json() as SwissmedicPage
  } catch (err) {
    console.error(`[swissmedic] Fetch failed for page ${pageNumber}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/scrapers/fetch-with-retry.ts lib/scrapers/mhra.ts lib/scrapers/swissmedic.ts
git commit -m "refactor: extract shared scraper retry logic to fetch-with-retry.ts"
```

---

## Batch 3: Pipeline Reliability

### Task 11: Increase Cleanup Stuck Threshold

**Files:**
- Modify: `app/api/worker/cleanup/route.ts:7`

- [ ] **Step 1: Change the threshold from 20 to 30 minutes**

In `app/api/worker/cleanup/route.ts`, change line 7:

```typescript
// BEFORE:
const STUCK_THRESHOLD_MINUTES = 20
// AFTER:
const STUCK_THRESHOLD_MINUTES = 30
```

The max pipeline duration is 800 seconds (~13 minutes per `maxDuration = 800` in process-job). A 30-minute threshold ensures any legitimately running pipeline finishes before being marked as stuck, while still catching orphaned runs quickly.

- [ ] **Step 2: Configure Render Cron Job (manual)**

In the Render dashboard, create a Cron Job that hits `POST /api/worker/cleanup` every 10 minutes. The endpoint is already protected by QStash signature verification in production. For the cron job, either:
- Use Upstash's scheduled message feature (QStash → `POST /api/worker/cleanup` on a 10-minute schedule), or
- Use Render's native cron with the `WORKER_API_SECRET` header if `ENABLE_DEV_WORKER_BYPASS` is not set in production

This is an infrastructure configuration, not a code change.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/worker/cleanup/route.ts
git commit -m "fix: increase orphaned run threshold from 20 to 30 minutes (maxDuration is 13min)"
```

---

### Task 12: Stream Scraper Results to DB Per-Source

**Files:**
- Modify: `lib/pipeline/stages/scrape.ts`
- Modify: `lib/pipeline/run-search.ts:97`
- Modify: `lib/pipeline/stages/insert-results.ts`

- [ ] **Step 1: Add per-source insert to `scrapeStage`**

In `lib/pipeline/stages/scrape.ts`, add an import at the top:

```typescript
import { insertResultsStage } from './insert-results'
```

After the `Promise.allSettled` loop (line 158-179) that aggregates source results into `ctx.items`, add per-source insertion. Replace the current aggregation block (lines 158-184) with:

```typescript
  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => {
      const timeoutMs = SOURCE_TIMEOUTS_MS[id] ?? DEFAULT_TIMEOUT_MS
      return withTimeout(processSource(id, idx), timeoutMs, id.toUpperCase())
    }),
  )

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      // Set ctx.items to this source's items only, insert, then clear
      ctx.items = r.value.items
      r.value.contentChanged.forEach((id) => ctx.contentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => ctx.canonicalIds.set(eid, cid))
      ctx.warnings.push(...r.value.warnings)

      if (ctx.items.length > 0) {
        await insertResultsStage(ctx)
        ctx.items = [] // release memory
      }
    } else {
      const sourceLabel = activeSources[i].toUpperCase()
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason instanceof Error ? r.reason.message : String(r.reason))
      ctx.warnings.push(
        `${sourceLabel} database was unavailable during this search and returned no results.`
      )
    }
  }

  const allFailed = sourceResults.every(r => r.status === 'rejected')
  if (allFailed) {
    throw new Error('All selected databases failed. No results could be retrieved.')
  }
```

- [ ] **Step 2: Update `insertResultsStage` to append instead of replace**

In `lib/pipeline/stages/insert-results.ts`, change line 34:

```typescript
// BEFORE:
ctx.insertedRows = allInserted
// AFTER:
ctx.insertedRows.push(...allInserted)
```

This allows `insertResultsStage` to be called multiple times (once per source), accumulating `insertedRows` across calls.

- [ ] **Step 3: Remove `insertResultsStage` from sequential stage list in `run-search.ts`**

In `lib/pipeline/run-search.ts`, change line 97:

```typescript
// BEFORE:
const stages = [scrapeStage, insertResultsStage, filterStage, persistDecisionsStage]
// AFTER:
const stages = [scrapeStage, filterStage, persistDecisionsStage]
```

Also remove the import of `insertResultsStage` from the top of the file (line 4):

```typescript
// BEFORE:
import { insertResultsStage } from './stages/insert-results'
// AFTER: (remove this line entirely)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Verify production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/stages/scrape.ts lib/pipeline/stages/insert-results.ts lib/pipeline/run-search.ts
git commit -m "refactor: stream scraper results to DB per-source instead of accumulating in memory"
```

---

## Final Verification

### Task 13: Full Build and Type Check

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

```bash
rm -rf .next && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Full type check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Run existing tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: All existing tests pass.

- [ ] **Step 4: Verify line count reductions**

```bash
wc -l app/dashboard/search/search-panel.tsx app/api/reports/route.ts
```

Expected: `search-panel.tsx` is ~350-450 lines (down from 1002). `reports/route.ts` is ~200 lines (down from 671).

- [ ] **Step 5: Verify no duplicate definitions**

```bash
echo "=== escHtml definitions ===" && grep -rn "function escHtml" app/ lib/ --include="*.ts" --include="*.tsx" && echo "=== SOURCE_LABELS definitions ===" && grep -rn "const SOURCE_LABELS\|const DB_LABELS" app/ lib/ --include="*.ts" --include="*.tsx" && echo "=== as never casts ===" && grep -rn "as never" app/ lib/ --include="*.ts" --include="*.tsx" | wc -l
```

Expected:
- `escHtml`: only in `lib/utils/html.ts`
- `SOURCE_LABELS`: only in `lib/domain/source-labels.ts`
- `as never` count: `0`
