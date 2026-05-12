# P0 Audit Fixes — Design Spec

**Date:** 2026-05-12
**Origin:** Robert Friedrich (PRRC/QM co-founder) council review — 3 blockers preventing QMS-validated PMS evidence
**Approach:** Minimal (Approach 1) — UI changes + 1 migration, no new API routes
**Estimated diff:** ~200 lines across 5 files + 1 migration

## Problem

Three gaps identified during PRRC audit review prevent Neuridion search runs from being accepted as QMS-validated PMS evidence under EU MDR Article 84 and ISO 13485 Section 4.1.6:

1. **Search terms not persisted or shown in reports** — auditors cannot verify what was actually searched. The report's "Search Parameters" field contains a generic sentence instead of the actual terms used.
2. **No raw/unfiltered results view** — auditors cannot verify the AI didn't silently hide relevant FSNs. Every view and export includes AI decisions.
3. **Review workflow not surfaced** — the backend supports `draft → reviewed → approved` state transitions (migration 034, API at `/api/search-runs/[id]/review`), but no UI buttons or status badges exist.

## Design

### Fix 1: Persist and Display Search Terms

#### 1a. Migration — `052_search_runs_terms_used.sql`

Add a nullable JSONB column to `search_runs`:

```sql
ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS terms_used jsonb;
```

Nullable by design — existing runs get `null`, correctly indicating "terms not tracked for this run." New runs get a structured payload.

#### 1b. JSONB shape

```json
{
  "manufacturer_terms": ["braun"],
  "device_terms": ["infusomat"],
  "raw_manufacturer": "B. Braun",
  "raw_device_name": "Infusomat Space",
  "term_algorithm_version": "1"
}
```

- `manufacturer_terms` / `device_terms`: The computed search tokens actually sent to scrapers
- `raw_manufacturer` / `raw_device_name`: Point-in-time snapshot of profile inputs (denormalized intentionally — profiles can be edited after the run, but audit trail must reflect what was searched)
- `term_algorithm_version`: Bumped when `buildManufacturerSearchTerms` logic changes, so auditors can distinguish term-generation eras

#### 1c. Pipeline change — `lib/pipeline/run-search.ts`

After computing search terms (current lines 101-104), persist them with Zod validation:

```typescript
import { z } from 'zod'

const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})

// After buildManufacturerSearchTerms() call
const manufacturerTerms = extractManufacturerTerms(safeProfile.manufacturer ?? '')
const deviceTerms = searchTerms.filter(t => !manufacturerTerms.includes(t))

const termsPayload = TermsUsedSchema.parse({
  manufacturer_terms: manufacturerTerms,
  device_terms: deviceTerms,
  raw_manufacturer: safeProfile.manufacturer ?? '',
  raw_device_name: safeProfile.device_name ?? '',
  term_algorithm_version: '1',
})

const { error: termsError } = await db
  .from('search_runs')
  .update({ terms_used: termsPayload })
  .eq('id', runId)
  .select()

if (termsError) console.error('[pipeline] Failed to persist terms_used:', termsError.message)
```

**Key decisions (council-validated):**
- Await the update, log errors, do NOT throw — pipeline should not abort if metadata save fails
- Zod-validate the payload before writing to prevent unbounded JSONB from malformed profile data
- Use admin client (already in scope as `db`) — pipeline runs server-side with no user session

#### 1d. Report template — `app/api/reports/route.ts`

**HTML/PDF (`buildReportHtml`):** Replace the generic "Search Parameters" row in the Section 2 methodology table. When `terms_used` is present, render structured rows:

| Row | Content |
|-----|---------|
| Manufacturer Terms | Code badges for each term + "(derived from [raw_manufacturer])" |
| Device Terms | Code badges for each term + "(derived from [raw_device_name])" |
| Term Derivation | "Legal suffixes, generic words, and tokens ≤4 characters removed. Algorithm v[version]." |

When `terms_used` is `null` (legacy runs), keep the current generic sentence as fallback.

**Excel (`buildExcel`):** Add 3 rows to the Summary sheet:
- `Manufacturer Search Terms` → comma-joined term list
- `Device Search Terms` → comma-joined term list
- `Term Algorithm Version` → version string

**Run detail page (`app/dashboard/archive/[id]/page.tsx`):** Add a "Search Terms" row to the meta card grid, showing terms as inline code badges. Pass `terms_used` from the server query to the client component.

### Fix 2: Raw Data Tab + CSV Export

#### 2a. Raw Data tab — `app/dashboard/archive/[id]/run-results.tsx`

Add a `raw` tab to the existing `Tab` type and tab bar:

```typescript
type Tab = 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed' | 'raw'
```

When the `raw` tab is active:
- Render a flat table: Title, Manufacturer, Date, Source DB, Source URL
- No decision column, no color coding, no rationale
- Show explainer: "[N] items scraped from [M] databases — no AI filtering applied"
- Show `↓ Export CSV` button above the table (only visible on the Raw Data tab, not on other tabs)

The raw tab shows ALL results in chronological order (by `fsn_date` descending), regardless of AI decision. This is the same data already loaded — just rendered without the `filter_decision` join.

#### 2b. CSV export — client-side

Button click generates CSV from the `results` array:
- Columns: Title, Manufacturer, Date, Source DB, Source URL
- No AI decision, rationale, or confidence columns
- Uses `Blob` + `URL.createObjectURL` for download
- Filename: `neuridion-raw-results-[runId-first8]-[date].csv`

Client-side generation is appropriate because typical run size is 50-300 FSNs. For runs exceeding ~5000 items (unlikely given scraper caps), the browser handles this fine.

#### 2c. Data flow

No new API routes or queries needed. The parent `page.tsx` already fetches all `fsn_results` for the run. The raw tab renders them without joining `filter_decisions`. Results are passed as the existing `results` prop — the component just ignores the `filter_decision` field when rendering.

### Fix 3: Review Workflow Banner

#### 3a. Review banner — `app/dashboard/archive/[id]/page.tsx` + client component

Add a `ReviewBanner` component rendered above the results tabs on the run detail page. Three states:

| `review_status` | Banner Style | Content |
|-----------------|-------------|---------|
| `draft` | Amber (`bg-amber-50 border-amber-200`) | "This run has not been reviewed yet." + **Mark as Reviewed** button |
| `reviewed` | Blue (`bg-blue-50 border-blue-200`) | "Reviewed on [date]" + **Approve** button |
| `approved` | Green (`bg-green-50 border-green-200`) | "Approved on [date]" (no action button) |

Only show for completed/degraded runs — no review controls on running/error/cancelled runs.

#### 3b. API integration

Button clicks call `PATCH /api/search-runs/[id]/review` with `{ review_status: 'reviewed' | 'approved' }`. This endpoint already exists at `app/api/search-runs/[id]/review/route.ts` and handles:
- Zod validation
- State machine enforcement (`draft → reviewed → approved` only)
- Audit logging (`prrc_review_completed` event)
- User ownership check

After successful PATCH, optimistically update local state to show the new banner state.

#### 3c. Data flow

`page.tsx` already queries `review_status` from `search_runs` (line 32). Pass `review_status`, `run.id`, and `run.status` as props to the client component. The `reviewed_by` and `reviewed_at` fields are returned by the PATCH response and stored in local state after the action.

## Files Changed

| File | Change | Est. Lines |
|------|--------|-----------|
| `supabase/migrations/052_search_runs_terms_used.sql` | Add `terms_used JSONB` column | 2 |
| `lib/pipeline/run-search.ts` | Zod schema + persist terms after computation | ~20 |
| `app/api/reports/route.ts` | Structured terms in HTML template + Excel summary | ~40 |
| `app/dashboard/archive/[id]/page.tsx` | Pass `terms_used` + `review_status` props, add terms to meta card | ~20 |
| `app/dashboard/archive/[id]/run-results.tsx` | Raw Data tab, CSV export, ReviewBanner component | ~120 |

**Total estimated diff: ~200 lines**

## Files NOT Changed

- No new API routes (raw CSV is client-side; review API already exists)
- No changes to scrapers, filter pipeline, or coverage logic
- No changes to `product_profiles` or `filter_decisions`
- No changes to the archive list page (`archive/page.tsx` or `archive-table.tsx`)
- No RLS policy changes needed (column added to existing row, covered by row-level policy)

## Testing

- `npx tsc --noEmit` — TypeScript must pass
- Verify migration applies cleanly
- Manual verification:
  - Run a search → confirm `terms_used` is populated in DB
  - Generate report → confirm terms appear in PDF/HTML and Excel
  - View run detail → confirm Raw Data tab shows unfiltered results
  - Export CSV → confirm file contains all items without AI decisions
  - Click "Mark as Reviewed" → confirm banner transitions to reviewed state
  - Click "Approve" → confirm banner transitions to approved state
  - Check audit_log → confirm `prrc_review_completed` events logged

## Success Criteria

After this change:
1. Every new search run persists the exact terms used, visible in both the UI and generated reports
2. Auditors can view and export all scraped results without AI classification
3. PRRC can mark runs as reviewed/approved directly from the results page, with full audit trail
4. Legacy runs (before this change) degrade gracefully — generic text in reports, no review banner on non-completed runs

## Council Recommendations (Incorporated)

- **Security Auditor:** Zod-validate JSONB payload before write ✅
- **Backend Dev:** Await update with error logging, don't throw ✅
- **System Architect:** Add `term_algorithm_version` for reproducibility chain ✅
- **System Architect:** Point-in-time capture of raw profile fields for audit trail ✅
- **Backend Dev / Architect disagreement on raw fields:** Resolved in favor of keeping them — audit context requires denormalization
