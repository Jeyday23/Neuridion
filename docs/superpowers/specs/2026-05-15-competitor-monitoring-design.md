# Competitor Monitoring + Search Panel Cleanup — Design Spec

**Date:** 2026-05-15
**Status:** Draft
**Origin:** Council analysis of Robert Friedrich's PMS workflow (6 PDFs + PMS_Recherche_20251001.xlsx)

---

## Problem Statement

Robert Friedrich (PRRC/QM at COPRA System GmbH) searches 15+ competitor product names across BfArM, FDA MAUDE, MHRA, and Swissmedic every quarter. His Q3 2025 search found only 1 FSN — from competitor Dedalus (ORBIS Medication), not from COPRA System itself. Neuridion's pipeline only generates search terms from the user's own manufacturer/device name, so it would miss this FSN entirely. The competitor FSN is filtered out at the scrape stage before the AI ever sees it.

Additionally, the search panel exposes internal AI cost estimates and a "Preview Items" dry-run feature that add complexity without user value.

## Goals

1. Let users define competitor product names on their device profile
2. Wire these terms into the scrape and filter pipeline so competitor FSNs are found and classified
3. Remove cost estimate display from the search panel
4. Remove Preview Items button and its backend API
5. Remove dead genericTerms/manufacturerTerms input fields from the search panel

## Non-Goals

- Adding new database scrapers (FDA Recall, clinical trials, INAHTA)
- PSUR template generation
- Trend analysis
- Per-search term overrides (terms live on the profile, not per-run)

---

## Design

### 1. Schema: Reuse `search_strategy` JSONB Column

The `product_profiles` table already has a `search_strategy` JSONB column that is selected but never written to or consumed by the pipeline. We store competitor terms here with a defined shape:

```typescript
interface SearchStrategy {
  competitor_terms: Array<{
    name: string          // e.g. "ORBIS Medication", "MetaVision"
    manufacturer?: string // e.g. "Dedalus", "iMDsoft"
  }>
}
```

**No migration needed.** The column exists and is typed as `Json`. We define the shape in application code with Zod validation.

**Validation rules:**
- Max 20 competitor entries per profile
- `name` required, 1-100 characters
- `manufacturer` optional, 0-100 characters
- Empty array is the default (backward-compatible)

### 2. Pipeline: Merge Competitor Terms into Search

**File: `lib/pipeline/run-search.ts` (line 46)**

Current code:
```typescript
const searchTerms = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
```

New logic:
1. Generate auto-terms from profile manufacturer/device (unchanged)
2. Read `profile.search_strategy.competitor_terms`
3. For each competitor entry, extract discriminating tokens using `extractManufacturerTerms(entry.manufacturer)` and device tokens from `entry.name` (tokens >= 2 chars, not in generic word lists — lower threshold than auto-extraction because these are user-specified terms; e.g., "ICM", "ICCA" must not be dropped)
4. Collect all competitor tokens into a separate `competitorTerms` array
5. Pass both `searchTerms` (profile's own) and `competitorTerms` to the pipeline context

**File: `lib/pipeline/types.ts`**

Add to `ProfileRow`:
```typescript
search_strategy: { competitor_terms?: Array<{ name: string; manufacturer?: string }> } | null
```

Add to `PipelineContext`:
```typescript
competitorTerms: string[]   // tokens extracted from competitor entries
```

**File: `lib/pipeline/stages/scrape.ts` (line 47-57)**

Current: `localSearchTerms` built from profile manufacturer/device only, passed to scrapers.

New: Union `localSearchTerms` with `ctx.competitorTerms`. The scrapers' `searchTerms` parameter already accepts a string array and does OR-matching (BfArM: `terms.some(t => hay.includes(t))`, FDA: Lucene OR query). A competitor term like "orbis" matching in the hay is exactly the behavior we want — the FSN is fetched instead of dropped.

**File: `lib/pipeline/stages/filter.ts` (lines 56-95)**

The manufacturer pre-filter currently hard-excludes FSNs where NONE of the profile's manufacturer/device terms match. With competitor terms:
- Build an extended `filterSearchTerms` array that includes competitor tokens
- If ANY competitor token matches the FSN's hay string, pass the item through to the AI filter (do not hard-exclude)
- The AI filter's system prompt already handles competitor/substantially-equivalent device classification correctly — it will classify as "relevant" or "uncertain" based on clinical domain overlap

**Audit trail:** The existing `terms_used` persistence at `run-search.ts:50-68` writes search terms to the search run. Add a `competitor_terms` field to the `TermsUsedSchema` so the audit trail captures which competitor names were searched.

### 3. Profile Edit UI

**File: `app/dashboard/profiles/` (create/edit form)**

Add a "Competitor / Similar Products" section below the existing device fields:
- Header: "Competitor Products to Monitor"
- Subtext: "Add products similar to yours. Their FSNs will be included in search results for AI review."
- Dynamic list with add/remove:
  - Input: "Product name" (required) + "Manufacturer" (optional)
  - "+" button to add row, "x" button to remove
  - Max 20 entries, validated client-side and server-side
- Persisted to `search_strategy.competitor_terms` via the profiles PATCH endpoint

### 4. Profiles API Changes

**File: `app/api/profiles/route.ts` (POST)**
**File: `app/api/profiles/[id]/route.ts` (PATCH)**

Accept `competitor_terms` in the request body. Validate with Zod:
```typescript
const CompetitorTermSchema = z.object({
  name: z.string().min(1).max(100),
  manufacturer: z.string().max(100).optional(),
})
const SearchStrategySchema = z.object({
  competitor_terms: z.array(CompetitorTermSchema).max(20).default([]),
})
```

Write to `search_strategy` column as `{ competitor_terms: [...] }`.

### 5. Search Panel Removals

**Remove cost estimate (lines 908-924):**
- Delete the `costEstimate` useMemo (lines 444-471)
- Delete the JSX block rendering "Estimated AI cost: ..." (lines 908-924)

**Remove Preview Items button (lines 934-941):**
- Delete `previewPhase` and `previewCount` state (lines 383-384)
- Delete `runPreview()` function (lines 473-501)
- Delete the preview button JSX (lines 934-941)
- Delete the "X items found in preview" span (lines 917-921)

**Delete Preview API route:**
- Delete `app/api/search-runs/preview/route.ts`

**Remove dead search term fields (lines 807-852):**
- Delete `genericTerms` and `manufacturerTerms` state (lines 371-372)
- Delete the input fields JSX (lines 807-852)
- Remove these terms from `saveDraft()` body (lines 539-540)

**Remove dead i18n keys:**
- `genericTerms`, `manufacturerTerms` (EN lines 22, 24; DE lines 94, 96)
- `previewItems`, `previewing` (EN lines 30-31; DE lines 102-103)

### 6. What Stays Unchanged

- The `search_drafts` table and save/load draft functionality (minus the dead term fields)
- The "Run Search" button and core search flow
- The long-search and medium-search warning banners (these are useful)
- The file upload area (even if partially functional — separate concern)
- All scraper implementations (they already accept `searchTerms` arrays)
- The AI filter system prompt (already handles competitor classification)

---

## Data Flow (After Changes)

```
Profile (device_name, manufacturer, search_strategy.competitor_terms)
  │
  ▼
run-search.ts
  ├─ buildManufacturerSearchTerms(manufacturer, device_name) → ownTerms
  ├─ extractCompetitorTokens(competitor_terms) → competitorTerms
  └─ PipelineContext { searchTerms: ownTerms, competitorTerms }
       │
       ▼
     scrapeStage
       ├─ allTerms = union(ownTerms, competitorTerms)
       ├─ scrapers receive allTerms as searchTerms param
       └─ BfArM/MHRA/Swissmedic: client-side OR filter
          FDA: Lucene OR query across brand_name/generic_name/manufacturer_name
       │
       ▼
     filterStage
       ├─ manufacturer pre-filter: check ownTerms AND competitorTerms
       ├─ FSN matches own terms → pass to AI
       ├─ FSN matches competitor terms → pass to AI
       └─ FSN matches nothing → hard-exclude as "manufacturer mismatch"
       │
       ▼
     AI filter (unchanged)
       └─ Classifies as relevant / uncertain / excluded with rationale
```

---

## Testing

1. **Unit test:** `extractCompetitorTokens()` returns correct tokens for entries like `{name: "ORBIS Medication", manufacturer: "Dedalus"}`
2. **Unit test:** Merged search terms include both own-device and competitor tokens, deduplicated
3. **Integration test:** A profile with competitor term "Orbis" + BfArM scraper would NOT filter out the ORBIS Medication FSN (the exact scenario from Robert's Q3 2025 search)
4. **Manual test:** Create a profile with competitor terms, run a search, verify competitor FSNs appear in results
5. **Manual test:** Verify cost estimate and preview items are gone from the search panel
6. **TypeScript check:** `npx tsc --noEmit` passes after all changes

---

## Risk Assessment

- **Low risk:** Removing cost estimate / preview items / dead fields — pure deletion, no functional dependency
- **Medium risk:** Pipeline term merging — could increase scraper result volume significantly (more items fetched = more AI cost). Mitigated by the existing `MAX_FILTER_ITEMS_PER_RUN` cap (default 300, configurable to 500)
- **Low risk:** Profile schema change — reuses existing `search_strategy` JSONB column, no migration needed, backward-compatible (empty array default)
