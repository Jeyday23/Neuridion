# Robert Feedback Fixes — Design Spec

**Date:** 2026-05-29
**Author:** Jeremiah + Claude (Genius Mode: Lovelace, Knuth, Hamilton, Torvalds, Quazi)
**Status:** Draft
**Priority:** P0 — blocks public launch

---

## Problem Statement

Robert Friedrich (PRRC, domain expert) tested the production Neuridion app and reported 6 issues and 6 improvement proposals. The issues range from a 45-minute search hang to confusing navigation to architectural gaps in how search strategy documents attach to profiles.

### Robert's Issues

| # | Issue | Severity |
|---|-------|----------|
| I1 | Search strategy docs can only be uploaded globally — not per product profile | High |
| I2 | Navigation between Dashboard and Admin was not obvious — found only via buried "Admin" button | Medium |
| I3 | 2-month search with full profile (15 competitors, strategy, intended use) ran 45+ minutes | Critical |
| I4 | Competitor info entered in list AND inside uploaded strategy doc may cause duplicate processing | High |
| I5 | Lightweight profile (name, manufacturer, intended use only) took 18 minutes for 2-month search | High |
| I6 | Report generation on Archive page is also taking unusually long | Medium |

### Robert's Proposals

| # | Proposal |
|---|---------|
| P1 | Search strategy should attach to individual product profiles |
| P2 | Search strategy input/upload should be in the Product Profile section |
| P3 | When a profile is selected on Search page, show its saved details before "Run Search" |
| P4 | Rename "Overview" to "Administration" or make the Administration label more prominent |
| P5 | If no strategy doc uploaded → auto-generate strategy from profile fields |
| P6 | If strategy doc contains competitor logic → handle duplicate competitor list differently |

---

## Root Cause Analysis

### Performance (I3, I5, I6)

**Search term explosion:** `run-search.ts:53` merges competitor tokens with search terms via `[...searchTerms, ...competitorTerms]` without deduplication. With 15 competitors, this generates 30+ search tokens. Each token broadens scraper queries — BfArM returns more HTML pages to scrape, FDA MAUDE returns more API results, etc.

**No per-scraper timeouts:** A single slow scraper (BfArM HTML pagination over 2 months) blocks the entire pipeline. `scrape.ts:143` uses `Promise.allSettled` for parallel execution, but no individual source has a time budget.

**AI filter bottleneck:** `filter.ts:127` runs at `pLimit(4)` concurrency. With 300 items at ~2-5s per Claude API call, filtering alone takes 2.5-6 minutes. More items (from broadened scraper queries) = longer.

**Report generation:** `reports/route.ts` generates HTML → Excel → DOCX → PDF sequentially with `maxDuration = 120`. This is adequate for normal result sets but becomes slow with 200+ FSN rows generating large Excel/DOCX files.

### Architecture (I1, I4)

**Incomplete profile abstraction:** `product_profiles.search_strategy` JSONB only stores `competitor_terms`. Strategy documents upload to Supabase Storage via the Search page and attach to search drafts — not to profiles. The profile is an incomplete representation of "what to monitor."

**Duplicate processing path:** Competitors entered in the profile form AND mentioned inside an uploaded strategy document both generate search tokens. The system has no deduplication between these sources.

### UX (I2, P3, P4)

**Navigation:** Sidebar shows Search, Profiles, Archive, Billing, Settings. "Admin" is below the quota bar, separated by a divider. There's no "Overview" or "Administration" label. Robert expected a more prominent administration entry point.

**No profile preview:** The search page profile dropdown (`search-panel.tsx:711-717`) shows only `device_name — manufacturer`. No intended use, competitors, or strategy docs visible before running a search.

---

## Design

### Workstream A: Profile-Attached Strategy (I1, I4 / P1, P2, P5, P6)

**Principle:** The product profile is the complete, self-contained unit of "what to monitor" (Lovelace). Fix the data structure and the code fixes itself (Torvalds).

#### A1. Extend `product_profiles.search_strategy` schema

Current: `{ competitor_terms: [...] }`
New: `{ competitor_terms: [...], strategy_doc_paths: string[], auto_generated_summary: string | null }`

- `strategy_doc_paths` — array of Supabase Storage paths for uploaded strategy documents
- `auto_generated_summary` — **deferred to v2** (Quazi: ship fast, add polish later). For now, the profile fields themselves (device name, manufacturer, intended use, competitors) serve as the search strategy.

No new migration needed — the JSONB column already accepts arbitrary keys. The API and form changes enforce the schema.

#### A2. Move file upload from Search page to Profile form

- Add "Search Strategy Documents" section to `profile-form.tsx` (create) and `edit-form.tsx` (edit)
- Upload to Supabase Storage at `{user_id}/profiles/{profile_id}/{filename}`
- Store paths in `search_strategy.strategy_doc_paths`
- Max 5 files per profile, 10MB each (same limits as current)
- Remove the file upload section from `search-panel.tsx`
- Files remain reference-only (audit/traceability) — NOT fed to AI classification

#### A3. Duplicate competitor handling (P6)

Add a UI note in the profile form:
> "If your uploaded strategy document already contains competitor information, you don't need to re-enter it in the competitor list below. The system uses the competitor list for search term generation — duplicates may cause broader search results and longer processing times."

No automated dedup between uploaded doc content and competitor list (docs are reference-only, not parsed).

#### A4. Search drafts migration

Existing search drafts with `uploaded_file_paths` continue to work. New drafts won't have file paths — they reference the profile's attached docs instead. No breaking migration needed.

### Workstream B: Performance (I3, I5, I6)

**Principle:** Measure first, then optimize the critical 3% (Knuth). Shed low-priority work to let the pipeline complete (Hamilton).

#### B1. Search term deduplication — HOTFIX

**File:** `lib/pipeline/stages/scrape.ts:53`

Current: `const localSearchTerms = [...new Set([...searchTerms, ...competitorTerms])]`

This already has `new Set()` but the dedup is only within `localSearchTerms`. The real issue is that `competitorTerms` from `extractCompetitorTokens()` (`manufacturer-terms.ts:84-122`) extracts ALL tokens from competitor names/manufacturers with a very low threshold (length >= 2). With 15 competitors, this generates dozens of broad tokens like "pro", "med", "bio" that match thousands of unrelated FSNs.

**Fix:** Apply the same filtering to competitor tokens as manufacturer tokens:
- Remove tokens that match `GENERIC_MFR_WORDS` or `GENERIC_DEVICE_WORDS`
- Increase minimum token length from 2 to 3 (except known short brands)
- Limit to max 3 tokens per competitor entry (currently unlimited)
- Total competitor token cap: 20 (currently 60 in schema, unlimited in practice)

**Expected impact:** Reduces scraper result set by 50-80% for profiles with many competitors, directly cutting scrape time and AI filter queue.

#### B2. Per-scraper timeouts

**File:** `lib/pipeline/stages/scrape.ts`

Add timeout per source using `Promise.race`:

| Source | Timeout | Rationale |
|--------|---------|-----------|
| BfArM | 180s | HTML pagination is slowest |
| FDA MAUDE | 90s | REST API, rate-limited |
| MHRA | 90s | HTML scraper |
| Swissmedic | 60s | REST API, fast |

If a source exceeds its timeout:
- Mark as degraded (existing warning mechanism)
- Return whatever items were collected so far
- Pipeline continues with remaining sources

#### B3. Pipeline timing instrumentation

**File:** `lib/pipeline/run-search.ts`

Add per-stage and per-source timing to the `search_runs` row:

```typescript
timing: {
  scrape_bfarm_ms: number,
  scrape_fda_ms: number,
  scrape_mhra_ms: number,
  scrape_swissmedic_ms: number,
  insert_results_ms: number,
  filter_ms: number,
  persist_decisions_ms: number,
  finalize_ms: number,
  total_items_scraped: number,
  total_items_filtered: number,
}
```

Store in `search_runs.timing` JSONB column (new column, migration required). This gives Knuth's "measure first" data for future optimizations (AI concurrency tuning, BfArM pagination optimization).

#### B4. AI filter concurrency — DEFERRED

Current: `pLimit(4)`. Do NOT change to 8 without timing data from B3. Once we have real measurements showing AI filtering is the bottleneck (vs. scraping), we can tune this. Knuth's principle: "it is often a mistake to make a priori judgments about what parts of a program are really critical."

#### B5. Report generation — no change needed

Report generation uses sequential format generation (HTML → Excel → DOCX → PDF) with `maxDuration = 120`. The slowness Robert observed is likely correlated with large result sets from the search term explosion (B1). Fixing B1 reduces result count, which fixes report time. Monitor after B1 ships.

### Workstream C: UX (I2 / P3, P4)

#### C1. Rename Admin link

**File:** `app/dashboard/sidebar-nav.tsx:63`

Change "Admin" to "Administration". Keep the Shield icon. No other nav changes needed — the sidebar structure (Search, Profiles, Archive, Billing, Settings) is already clear.

#### C2. Profile preview card on Search page

**File:** `app/dashboard/search/search-panel.tsx`

When a profile is selected in the dropdown, show a read-only preview card below it:

```
┌─────────────────────────────────────────────────┐
│ CardioSense Pro — Acme Medical GmbH             │
│                                                  │
│ Intended use: Continuous cardiac monitoring...    │
│ Device class: Class IIb  |  EMDN: Z12030101     │
│ Competitors: 3 products monitored                │
│ Strategy docs: 1 file attached                   │
│                                          [Edit →]│
└─────────────────────────────────────────────────┘
```

- Fetched from the existing profiles API response (already loaded for the dropdown)
- "Edit →" links to `/dashboard/profiles/{id}/edit`
- Collapses to a single line on mobile

---

## Implementation Priority

Based on Quazi's velocity principle — ship in impact order:

| Order | Task | Impact | Effort |
|-------|------|--------|--------|
| 1 | B1: Search term dedup + competitor token tightening | Fixes 45-min searches → ~5-10 min | 1-2 hours |
| 2 | B2: Per-scraper timeouts | Prevents infinite hangs | 1 hour |
| 3 | C1: Rename Admin → Administration | 5-min UX fix | 5 minutes |
| 4 | C2: Profile preview on search page | Shows profile details pre-search | 1-2 hours |
| 5 | A2: Move file upload to profile form | Completes profile abstraction | 2-3 hours |
| 6 | A1: Extend search_strategy schema | Data structure fix | 30 minutes |
| 7 | B3: Pipeline timing instrumentation | Enables future optimization | 1-2 hours |
| 8 | A3: Duplicate competitor UI note | User guidance | 15 minutes |

Total estimated effort: ~8-10 hours of implementation.

---

## Deferred to v2

- **P5: Auto-generated strategy summary** — Lovelace's vision of the profile as a complete specification. Requires AI summarization of profile fields into a human-readable PMS strategy paragraph. Good for the product but not blocking launch.
- **B4: AI filter concurrency tuning** — Requires timing data from B3 to make an informed decision.
- **Profile sharing between PRRCs** — Lovelace's long-term abstraction benefit. Once profiles are complete self-contained units, sharing becomes natural.

---

## Testing Plan

1. **B1 verification:** Run a 2-month search with Robert's full profile (15 competitors). Target: < 10 minutes.
2. **B2 verification:** Simulate a hanging scraper (mock timeout). Verify pipeline continues with degraded status.
3. **A2 verification:** Create a profile with strategy docs attached. Run a search. Verify docs appear in the profile and are referenced in the search run.
4. **C2 verification:** Select a profile on the search page. Verify preview card shows all fields correctly.
5. **Regression:** Run existing test suite (`186 tests`). TypeScript check must pass.

---

## Genius Mode Audit Trail

| Decision | Driving Lens | Trade-off |
|----------|-------------|-----------|
| Move strategy docs to profile | Lovelace (abstraction) + Torvalds (data structure) | Removes flexibility of per-search doc upload |
| Dedup competitor tokens aggressively | Knuth (measured bottleneck) + Hamilton (overload protection) | May miss some edge-case competitor matches |
| Per-scraper timeouts | Hamilton (priority shedding) | May return partial results for slow sources |
| Defer AI concurrency change | Knuth (measure first) | Leaves potential perf gain on the table |
| Defer auto-strategy generation | Quazi (ship fast) | Robert wanted this; gets it in v2 |
| Profile preview instead of full strategy display | Quazi (fastest correct path) | Less info than P3 asked for, but ships faster |
