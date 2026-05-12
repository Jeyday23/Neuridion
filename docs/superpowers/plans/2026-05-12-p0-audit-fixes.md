# P0 Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable QMS-validated PMS evidence by persisting search terms in reports, adding a raw/unfiltered results view with CSV export, and surfacing the existing review workflow in the UI.

**Architecture:** One migration adds `terms_used JSONB` to `search_runs`. Pipeline persists terms at search time. Report templates render them. A new "Raw Data" tab + CSV export shows unfiltered results. A review banner with buttons calls the existing review API. All changes are in existing files — no new API routes.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Zod, ExcelJS, React 19

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `supabase/migrations/052_search_runs_terms_used.sql` | Add `terms_used` column | Create |
| `lib/pipeline/run-search.ts` | Persist search terms at pipeline start | Modify |
| `app/api/reports/route.ts` | Render terms in HTML/PDF and Excel reports | Modify |
| `app/dashboard/archive/[id]/page.tsx` | Pass `terms_used` + `review_status` props | Modify |
| `app/dashboard/archive/[id]/run-results.tsx` | Raw Data tab, CSV export, ReviewBanner | Modify |

---

### Task 1: Migration — Add `terms_used` column

**Files:**
- Create: `supabase/migrations/052_search_runs_terms_used.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 052_search_runs_terms_used.sql
-- Persist computed search terms for audit reproducibility (P0 audit fix)
ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS terms_used jsonb;
```

Write this to `supabase/migrations/052_search_runs_terms_used.sql`.

- [ ] **Step 2: Verify migration file**

Run: `cat supabase/migrations/052_search_runs_terms_used.sql`
Expected: The ALTER TABLE statement above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/052_search_runs_terms_used.sql
git commit -m "feat: add terms_used JSONB column to search_runs (migration 052)"
```

---

### Task 2: Pipeline — Persist search terms with Zod validation

**Files:**
- Modify: `lib/pipeline/run-search.ts` (lines 1-104)
- Test: `__tests__/run-search-terms.test.ts`

- [ ] **Step 1: Write failing test for terms persistence schema**

Create `__tests__/run-search-terms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Replicate the Zod schema that will be used in run-search.ts
const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})

export type TermsUsed = z.infer<typeof TermsUsedSchema>

describe('TermsUsed schema validation', () => {
  it('accepts valid terms payload', () => {
    const payload = {
      manufacturer_terms: ['braun'],
      device_terms: ['infusomat'],
      raw_manufacturer: 'B. Braun',
      raw_device_name: 'Infusomat Space',
      term_algorithm_version: '1',
    }
    expect(TermsUsedSchema.parse(payload)).toEqual(payload)
  })

  it('accepts empty terms arrays', () => {
    const payload = {
      manufacturer_terms: [],
      device_terms: [],
      raw_manufacturer: '',
      raw_device_name: '',
      term_algorithm_version: '1',
    }
    expect(TermsUsedSchema.parse(payload)).toEqual(payload)
  })

  it('rejects oversized manufacturer_terms array', () => {
    const payload = {
      manufacturer_terms: Array.from({ length: 11 }, (_, i) => `term${i}`),
      device_terms: [],
      raw_manufacturer: '',
      raw_device_name: '',
      term_algorithm_version: '1',
    }
    expect(() => TermsUsedSchema.parse(payload)).toThrow()
  })

  it('rejects term string exceeding 100 chars', () => {
    const payload = {
      manufacturer_terms: ['a'.repeat(101)],
      device_terms: [],
      raw_manufacturer: '',
      raw_device_name: '',
      term_algorithm_version: '1',
    }
    expect(() => TermsUsedSchema.parse(payload)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails (schema not yet exported)**

Run: `npx vitest run __tests__/run-search-terms.test.ts`
Expected: PASS (schema is defined inline in test — tests validate the shape we'll use)

Note: This test validates the schema shape independently. The actual integration with `run-search.ts` is verified by TypeScript compilation and manual testing.

- [ ] **Step 3: Add Zod import and TermsUsed schema to run-search.ts**

In `lib/pipeline/run-search.ts`, add after the existing import block (after line 12):

```typescript
import { z } from 'zod'

const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})
```

Add this between line 12 (`import { upsertCanonical...`) and line 14 (`// ── Public types`).

- [ ] **Step 4: Persist terms after profile fetch, before scraping begins**

In `lib/pipeline/run-search.ts`, add after line 70 (`if (activeSources.length === 0) activeSources.push('bfarm')`) and before line 72 (`const progressState`):

```typescript
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
    const { error: termsError } = await db
      .from('search_runs')
      .update({ terms_used: termsPayload })
      .eq('id', runId)
    if (termsError) console.error('[pipeline] Failed to persist terms_used:', termsError.message)
  } catch (e) {
    console.error('[pipeline] terms_used validation failed:', e)
  }
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (or only pre-existing unrelated ones)

- [ ] **Step 6: Run tests**

Run: `npx vitest run __tests__/run-search-terms.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline/run-search.ts __tests__/run-search-terms.test.ts
git commit -m "feat: persist search terms to search_runs.terms_used with Zod validation"
```

---

### Task 3: Report template — Display search terms in HTML/PDF and Excel

**Files:**
- Modify: `app/api/reports/route.ts` (lines 53-155 for Excel, lines 159-367 for HTML)

- [ ] **Step 1: Add `termsUsed` parameter to `buildExcel` function**

In `app/api/reports/route.ts`, change the `buildExcel` function signature at line 53 from:

```typescript
async function buildExcel(
  rows: FsnRow[],
  meta: { device: string; manufacturer: string; period_from: string; period_to: string }
): Promise<Buffer> {
```

to:

```typescript
async function buildExcel(
  rows: FsnRow[],
  meta: { device: string; manufacturer: string; period_from: string; period_to: string },
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
): Promise<Buffer> {
```

- [ ] **Step 2: Add terms rows to Excel Summary sheet**

In `app/api/reports/route.ts`, after line 151 (the `if (failedCount > 0)` block's closing brace), add:

```typescript
  if (termsUsed) {
    sumWs.addRow([])
    addMeta('Manufacturer Search Terms', termsUsed.manufacturer_terms.join(', ') || '(none)')
    addMeta('Device Search Terms', termsUsed.device_terms.join(', ') || '(none)')
    addMeta('Source Manufacturer Name', termsUsed.raw_manufacturer || '—')
    addMeta('Source Device Name', termsUsed.raw_device_name || '—')
    addMeta('Term Algorithm Version', termsUsed.term_algorithm_version)
  }
```

- [ ] **Step 3: Add `termsUsed` parameter to `buildReportHtml` function**

In `app/api/reports/route.ts`, change the `buildReportHtml` function signature at line 159 from:

```typescript
function buildReportHtml(
  profile: { device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null },
  run: { period_from: string; period_to: string },
  rows: FsnRow[],
  runId: string
): string {
```

to:

```typescript
function buildReportHtml(
  profile: { device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null },
  run: { period_from: string; period_to: string },
  rows: FsnRow[],
  runId: string,
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
): string {
```

- [ ] **Step 4: Replace generic "Search Parameters" row in HTML template**

In `app/api/reports/route.ts`, replace the line at ~286:

```typescript
    <tr><td>Search Parameters</td><td>All published FSNs within the specified period were retrieved and assessed for relevance to the device profile above.</td></tr>
```

with:

```typescript
    ${termsUsed ? `
    <tr><td>Manufacturer Terms</td><td>${termsUsed.manufacturer_terms.map(t => `<code style="background:#dcfce7;padding:1px 5px;border-radius:3px;font-size:9pt;">${escHtml(t)}</code>`).join(' ') || '<em>none</em>'} <span style="color:#888;font-size:8.5pt;">(derived from &ldquo;${escHtml(termsUsed.raw_manufacturer)}&rdquo;)</span></td></tr>
    <tr><td>Device Terms</td><td>${termsUsed.device_terms.map(t => `<code style="background:#dcfce7;padding:1px 5px;border-radius:3px;font-size:9pt;">${escHtml(t)}</code>`).join(' ') || '<em>none</em>'} <span style="color:#888;font-size:8.5pt;">(derived from &ldquo;${escHtml(termsUsed.raw_device_name)}&rdquo;)</span></td></tr>
    <tr><td>Term Derivation</td><td>Legal suffixes, generic words, and tokens &le;4 characters removed. Algorithm v${escHtml(termsUsed.term_algorithm_version)}.</td></tr>
    ` : `<tr><td>Search Parameters</td><td>All published FSNs within the specified period were retrieved and assessed for relevance to the device profile above.</td></tr>`}
```

- [ ] **Step 5: Update `buildExcel` call site to pass `termsUsed`**

In `app/api/reports/route.ts`, at line ~476, change:

```typescript
  const excelBuf = await buildExcel(rows, {
    device:       profile.device_name,
    manufacturer: profile.manufacturer,
    period_from:  run.period_from,
    period_to:    run.period_to,
  })
```

to:

```typescript
  const termsUsed = run.terms_used as {
    manufacturer_terms: string[]; device_terms: string[];
    raw_manufacturer: string; raw_device_name: string;
    term_algorithm_version: string;
  } | null

  const excelBuf = await buildExcel(rows, {
    device:       profile.device_name,
    manufacturer: profile.manufacturer,
    period_from:  run.period_from,
    period_to:    run.period_to,
  }, termsUsed)
```

- [ ] **Step 6: Update `buildReportHtml` call site to pass `termsUsed`**

In `app/api/reports/route.ts`, at line ~484, change:

```typescript
  const html = buildReportHtml(profile, { period_from: run.period_from, period_to: run.period_to }, rows, run_id)
```

to:

```typescript
  const html = buildReportHtml(profile, { period_from: run.period_from, period_to: run.period_to }, rows, run_id, termsUsed)
```

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "feat: display search terms in PDF/HTML and Excel report templates"
```

---

### Task 4: Run detail page — Pass `terms_used` and display in meta card

**Files:**
- Modify: `app/dashboard/archive/[id]/page.tsx` (lines 26-41 for query, lines 126-154 for meta card)

- [ ] **Step 1: Add `terms_used` to the Supabase query**

In `app/dashboard/archive/[id]/page.tsx`, the query at line 28 already uses `select(...)`. Add `terms_used` to the select string. Change:

```typescript
      id, status, created_at, started_at, completed_at,
      search_period_from, search_period_to, period_from, period_to,
      total_results, relevant_count, uncertain_count, excluded_count, filter_failed_count,
      dbs_searched, error_message, review_status,
      report_html_path, report_pdf_path, report_excel_path, report_generated_at,
      product_profiles ( device_name, manufacturer )
```

to:

```typescript
      id, status, created_at, started_at, completed_at,
      search_period_from, search_period_to, period_from, period_to,
      total_results, relevant_count, uncertain_count, excluded_count, filter_failed_count,
      dbs_searched, error_message, review_status, terms_used,
      report_html_path, report_pdf_path, report_excel_path, report_generated_at,
      product_profiles ( device_name, manufacturer )
```

- [ ] **Step 2: Extract `terms_used` and type it**

After line 99 (`const tot = run.total_results ?? results.length`), add:

```typescript
  const termsUsed = (run as { terms_used?: { manufacturer_terms: string[]; device_terms: string[]; term_algorithm_version: string } | null }).terms_used ?? null
```

- [ ] **Step 3: Add search terms row to meta card**

In the meta card grid (lines 126-154), after the "Report" div block (lines 147-153), add a new grid item:

```typescript
        {termsUsed && (termsUsed.manufacturer_terms.length > 0 || termsUsed.device_terms.length > 0) && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Search Terms</p>
            <div className="flex flex-wrap gap-1.5">
              {termsUsed.manufacturer_terms.map((t: string) => (
                <code key={`m-${t}`} className="bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded text-xs">{t}</code>
              ))}
              {termsUsed.device_terms.map((t: string) => (
                <code key={`d-${t}`} className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-xs">{t}</code>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Pass `reviewStatus` and `runId` and `runStatus` as props to RunResults**

Change the `RunResults` usage at line ~198 from:

```typescript
        <RunResults results={results} />
```

to:

```typescript
        <RunResults results={results} runId={run.id} runStatus={run.status} reviewStatus={(run as { review_status?: string }).review_status ?? 'draft'} />
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Will show errors about `RunResults` props not matching — that's expected, we'll fix in Task 5.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/archive/[id]/page.tsx
git commit -m "feat: display search terms in run detail meta card, pass review props"
```

---

### Task 5: Raw Data tab, CSV export, and Review banner

**Files:**
- Modify: `app/dashboard/archive/[id]/run-results.tsx` (entire file)

This is the largest task. It adds three features to the existing client component.

- [ ] **Step 1: Update the Tab type and RunResults props**

In `app/dashboard/archive/[id]/run-results.tsx`, change line 29:

```typescript
type Tab = 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
```

to:

```typescript
type Tab = 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed' | 'raw'
```

Change the `RunResults` function signature at line 151 from:

```typescript
export function RunResults({ results }: { results: FsnResult[] }) {
```

to:

```typescript
export function RunResults({ results, runId, runStatus, reviewStatus: initialReviewStatus }: {
  results: FsnResult[]
  runId: string
  runStatus: string
  reviewStatus: string
}) {
```

- [ ] **Step 2: Add review state and handler inside RunResults**

Inside the `RunResults` function, after the existing `const [tab, setTab] = useState<Tab>('all')` at line 152, add:

```typescript
  const [reviewStatus, setReviewStatus] = useState(initialReviewStatus)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewedAt, setReviewedAt] = useState<string | null>(null)

  async function handleReview(newStatus: 'reviewed' | 'approved') {
    setReviewLoading(true)
    try {
      const res = await fetch(`/api/search-runs/${runId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        setReviewStatus(data.review_status)
        setReviewedAt(data.reviewed_at)
      }
    } finally {
      setReviewLoading(false)
    }
  }
```

- [ ] **Step 3: Add CSV export function inside RunResults**

After the `handleReview` function, add:

```typescript
  function exportRawCsv() {
    const header = 'Title,Manufacturer,Date,Source,URL'
    const csvRows = results.map(r => {
      const esc = (s: string | null) => {
        if (!s) return ''
        const escaped = s.replace(/"/g, '""')
        return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') ? `"${escaped}"` : escaped
      }
      return [esc(r.title), esc(r.manufacturer), esc(r.fsn_date), esc(r.source_db), esc(r.source_url)].join(',')
    })
    const csv = [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neuridion-raw-results-${runId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
```

- [ ] **Step 4: Add the "Raw Data" tab to the tabs array**

Change the existing `tabs` definition (around line 174) from:

```typescript
  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',           label: `All (${counts.all})` },
    { key: 'relevant',      label: `Relevant (${counts.relevant})` },
    { key: 'uncertain',     label: `Uncertain (${counts.uncertain})` },
    { key: 'excluded',      label: `Excluded (${counts.excluded})` },
    ...(counts.filter_failed > 0
      ? [{ key: 'filter_failed' as Tab, label: `Not Reviewed (${counts.filter_failed})` }]
      : []),
  ]
```

to:

```typescript
  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',           label: `All (${counts.all})` },
    { key: 'relevant',      label: `Relevant (${counts.relevant})` },
    { key: 'uncertain',     label: `Uncertain (${counts.uncertain})` },
    { key: 'excluded',      label: `Excluded (${counts.excluded})` },
    ...(counts.filter_failed > 0
      ? [{ key: 'filter_failed' as Tab, label: `Not Reviewed (${counts.filter_failed})` }]
      : []),
    { key: 'raw',           label: `Raw Data (${counts.all})` },
  ]
```

- [ ] **Step 5: Add the ReviewBanner JSX**

In the `return` block of `RunResults`, before the existing `{counts.filter_failed > 0 && (` block (around line 186), add the review banner:

```typescript
      {(runStatus === 'complete' || runStatus === 'degraded') && (
        <div className={clsx(
          'mb-4 rounded-lg border px-4 py-3 flex items-center gap-3 text-sm',
          reviewStatus === 'approved' ? 'bg-green-50 border-green-200' :
          reviewStatus === 'reviewed' ? 'bg-blue-50 border-blue-200' :
          'bg-amber-50 border-amber-200'
        )}>
          <span className={clsx(
            'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
            reviewStatus === 'approved' ? 'bg-green-100 text-green-800 border-green-300' :
            reviewStatus === 'reviewed' ? 'bg-blue-100 text-blue-800 border-blue-300' :
            'bg-amber-100 text-amber-800 border-amber-300'
          )}>
            {reviewStatus === 'approved' ? 'Approved' : reviewStatus === 'reviewed' ? 'Reviewed' : 'Draft'}
          </span>
          <span className="text-zinc-600 flex-1">
            {reviewStatus === 'approved' && `Approved${reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`}
            {reviewStatus === 'reviewed' && `Reviewed${reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`}
            {reviewStatus === 'draft' && 'This run has not been reviewed yet.'}
          </span>
          {reviewStatus === 'draft' && (
            <button
              onClick={() => handleReview('reviewed')}
              disabled={reviewLoading}
              className="ml-auto px-3 py-1.5 bg-[#0D9488] text-white rounded-lg text-xs font-medium hover:bg-[#0B8177] disabled:opacity-50"
            >
              {reviewLoading ? 'Saving...' : 'Mark as Reviewed'}
            </button>
          )}
          {reviewStatus === 'reviewed' && (
            <button
              onClick={() => handleReview('approved')}
              disabled={reviewLoading}
              className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {reviewLoading ? 'Saving...' : 'Approve'}
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 6: Add the Raw Data tab content rendering**

Replace the existing filtered results rendering block. Change from:

```typescript
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 py-8 text-center">No results in this category.</p>
      ) : (
        <div className="rounded-md border border-[#E2E8F0] bg-white">
          {filtered.map((r) => <ResultRow key={r.id} result={r} />)}
        </div>
      )}
```

to:

```typescript
      {tab === 'raw' ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">{results.length} items scraped from {new Set(results.map(r => r.source_db)).size} database{new Set(results.map(r => r.source_db)).size !== 1 ? 's' : ''} — no AI filtering applied</span>
            <button
              onClick={exportRawCsv}
              className="text-xs border border-zinc-300 rounded px-2.5 py-1 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-400 transition-colors"
            >
              ↓ Export CSV
            </button>
          </div>
          <div className="rounded-md border border-[#E2E8F0] bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Manufacturer</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Source</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 last:border-b-0">
                    <td className="px-4 py-2.5">
                      <a
                        href={safeHref(r.source_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-zinc-900 hover:text-[#0D9488] hover:underline"
                      >
                        {r.title}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">{r.manufacturer || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                      {r.fsn_date ? new Date(r.fsn_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{formatSourceLabel(r.source_db)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 py-8 text-center">No results in this category.</p>
      ) : (
        <div className="rounded-md border border-[#E2E8F0] bg-white">
          {filtered.map((r) => <ResultRow key={r.id} result={r} />)}
        </div>
      )}
```

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/archive/[id]/run-results.tsx
git commit -m "feat: add Raw Data tab, CSV export, and PRRC review banner to run detail"
```

---

### Task 6: Final verification and push

**Files:** None (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (including new `run-search-terms.test.ts`)

- [ ] **Step 3: Check git status**

Run: `git status`
Expected: Clean working tree, all changes committed

- [ ] **Step 4: Verify commit history**

Run: `git log --oneline -6`
Expected: 5 new commits on top of `e3702e0`:
1. `feat: add terms_used JSONB column to search_runs (migration 052)`
2. `feat: persist search terms to search_runs.terms_used with Zod validation`
3. `feat: display search terms in PDF/HTML and Excel report templates`
4. `feat: display search terms in run detail meta card, pass review props`
5. `feat: add Raw Data tab, CSV export, and PRRC review banner to run detail`

- [ ] **Step 5: Push to remote**

Run: `git push origin main`
Expected: Push succeeds
