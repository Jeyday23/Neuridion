# Scraper Pre-Filter Removal and Accuracy Fix

**Date:** 2026-06-04
**Triggered by:** Robert Friedrich (PRRC/QM, COPRA System GmbH) manual audit
**Severity:** Launch-blocking — regulatory recall completeness is the core product promise

## Problem Statement

Neuridion's scrapers apply a hard `searchTerms` filter **after** scraping but **before** the AI classifier sees the items. This contradicts the documented "pre-filter is boost-only, not hard-exclude" design principle in the AI pipeline.

**Measured impact (Robert's audit):**
- BfArM: manual = 200 results, Neuridion = 42 (79% dropped)
- MHRA: manual = 13 FSN, Neuridion = 10 (23% dropped)

The hard filter discards FSNs that don't contain the manufacturer/device search tokens in their title or raw_content text. Since the AI classifier is specifically designed to handle relevance scoring with nuance (boost-only, confidence-weighted), these items should reach the AI stage and be classified properly rather than silently dropped.

## Root Cause Analysis

### Bug 1: searchTerms hard-filter in bfarm.ts and mhra.ts

Both scrapers have identical post-scrape filter blocks that discard items not matching search tokens:

```typescript
// bfarm.ts and mhra.ts — both have this pattern
if (params.searchTerms && params.searchTerms.length > 0) {
  const terms = params.searchTerms.map(t => t.toLowerCase())
  const filtered = result.items.filter(item => {
    const hay = `${item.title} ${item.raw_content ?? ''}`.toLowerCase()
    const match = terms.length >= 2
      ? terms.every(t => hay.includes(t))   // AND for 2+ terms
      : terms.some(t => hay.includes(t))    // OR for 1 term
    return match
  })
  return { ...result, items: filtered }
}
```

**Why this drops results:**
- For 2+ search terms, uses `every()` (AND logic) — an item must contain ALL tokens
- `raw_content` in BfArM year-shortcut mode is title-only (`sanitizeContent(item.title)`) — detail page text is never in the haystack
- Manufacturer names embedded in FSN body text are invisible to this filter
- The filter runs unconditionally whenever `searchTerms` is non-empty, which is always during a normal pipeline run

### Bug 2: BfArM raw_content is title-only in year-shortcut mode

In `bfarm.ts` line 195:
```typescript
raw_content: sanitizeContent(item.title)
```

The year-shortcut scrape mode (used for searches spanning > 90 days) never fetches detail pages, so `raw_content` duplicates `title`. This means the search-term haystack for the hard filter is just the title repeated twice — manufacturer names, device descriptions, and FSN body text are all invisible.

### Bug 3: Cached canonical filter logic inconsistency

In `scrape.ts` lines 113-121, cached canonical items use **different** (looser) filter logic than fresh scrapes:
- Fresh scrapes: `every()` for 2+ terms (AND — strict)
- Cached canonical: `some()` for device terms (OR — loose), with special competitor-term bypass

This means the same search can return different results depending on whether it hits the cache or scrapes fresh — a non-determinism bug that would be extremely confusing to debug.

### Bug 4: MHRA alert_type may be too restrictive

In `mhra.ts` lines 53-57:
```typescript
const isDeviceFsn = alertTypes.some(t =>
  t === 'field-safety-notices' || t === 'device-safety-information'
)
```

The GOV.UK API may categorize some medical device FSNs under additional alert types. Robert found 13 FSN manually vs 10 from Neuridion — the 3 missing could be filtered by this type check. Need to verify the complete set of device-relevant alert types in the GOV.UK taxonomy.

### Bug 5: BfArM yearToShortcut parameter value

In `bfarm.ts` line 255:
```typescript
if (year === currentYear) return 'current_year'
```

Robert's working BfArM URL uses `thisyear` as the parameter value. If the BfArM server has changed its expected parameter values, `current_year` would return empty or different results. This needs verification against the live BfArM portal.

## Design

### Fix 1: Remove searchTerms hard-filter from scrapers

**Files:** `lib/scrapers/bfarm.ts`, `lib/scrapers/mhra.ts`

Remove the post-scrape `searchTerms` filter blocks entirely. Scrapers should return ALL items within the requested date range. Relevance filtering is the AI classifier's job.

**bfarm.ts** — delete the block at the end of scraping that filters by `params.searchTerms`. The function should return all scraped items.

**mhra.ts** — delete the identical filter block (lines 111-118). The function should return all deduped items.

**fda-maude.ts and swissmedic.ts** — audit for similar patterns. FDA uses Lucene query narrowing at the API level (different — that's server-side search, not client-side discard). Swissmedic uses client-side filtering. Both should be reviewed but may not need changes since their filtering mechanisms differ.

### Fix 2: Harmonize cached canonical filter in scrape.ts

**File:** `lib/pipeline/stages/scrape.ts`

The cached canonical retrieval (lines 109-121) applies its own filter logic. After removing the scraper-level filter, this cached path should also return all canonical items without search-term filtering. The AI classifier handles relevance.

Replace the filter block with a simple pass-through: if canonical items exist for the covered range, include all of them.

### Fix 3: Verify MHRA alert_type completeness

**File:** `lib/scrapers/mhra.ts`

Before changing the filter, audit the GOV.UK API to identify all alert_type values that can contain medical device FSNs. Options:
1. **Conservative:** Add any missing types (e.g., `medical-device-alert` if it exists) to the allowlist
2. **Aggressive:** Remove the alert_type filter entirely and let the AI classifier handle non-device alerts
3. **Recommended:** Keep the filter but expand it based on empirical evidence from the GOV.UK API

### Fix 4: Cost circuit-breaker (500 items/source)

**File:** `lib/pipeline/stages/scrape.ts`

Removing the hard-filter will increase the number of items reaching the AI classifier. Based on analysis:
- Current cost: ~$2/mo per Pro user (80% cache hit rate)
- Projected cost: ~$35/mo per Pro user (worst case, no cache hits on new items)
- Acceptable within Pro plan margins ($99/mo plan price)

Add a per-source item cap of 500 items as a safety valve. If a source returns more than 500 items in a single scrape, emit a warning and truncate. This prevents runaway costs from unexpectedly large result sets while still capturing the vast majority of FSNs.

The existing `MAX_ITEMS = 500` constant in bfarm.ts already serves this purpose for the scraper itself — this fix adds the same guard at the pipeline stage level for all sources.

### Fix 5: Verify BfArM yearToShortcut parameter

**File:** `lib/scrapers/bfarm.ts`

Verify the BfArM portal's expected shortcut values by:
1. Fetching the BfArM Kundeninformationen page and inspecting the HTML form/links
2. Checking if `current_year` or `thisyear` is the correct parameter
3. If they've changed, update `yearToShortcut()` accordingly

This is an investigation task — the fix depends on what the live BfArM portal actually expects.

## What NOT to change

- **AI filter pipeline** (`lib/claude/filter-pipeline.ts`) — this is working correctly with its boost-only design
- **Manufacturer token extraction** (`lib/search/manufacturer-terms.ts`) — tokens are still useful for AI prompt context, just not for hard-filtering
- **`ScraperParams.searchTerms`** — keep the parameter in the interface for potential future use (e.g., passing to AI as context) but scrapers should ignore it for filtering
- **FDA MAUDE Lucene queries** — server-side API query narrowing is different from client-side post-filter discard; this is acceptable

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| AI costs increase significantly | Medium | 500-item cap, existing cache (80% hit rate), monitor after deploy |
| BfArM returns thousands of irrelevant items | Low | MAX_ITEMS = 500 already caps scraper output |
| MHRA alert_type change introduces noise | Low | Keep type filter, just expand the allowlist |
| Cached canonical returns too many items | Medium | Same 500-item cap applies at pipeline level |
| yearToShortcut fix breaks other date ranges | Low | Only affects current-year parameter name; test with multiple years |

## Verification Plan

After implementing:
1. **BfArM regression test:** Run a search for COPRA System GmbH, period 04.03–04.06.2026 — result count should approach 200 (matching Robert's manual count)
2. **MHRA regression test:** Same period — result count should reach 13 (matching Robert's manual count)
3. **Cost monitoring:** Track AI API calls for 1 week post-deploy, compare to baseline
4. **Cache hit rate:** Verify cache hit rate remains ~80% for repeat searches
5. **Determinism test:** Run the same search twice — results should be identical regardless of cache state

## Implementation Order

1. Remove searchTerms hard-filter from `bfarm.ts` and `mhra.ts`
2. Harmonize cached canonical filter in `scrape.ts`
3. Verify and fix BfArM yearToShortcut parameter
4. Audit and expand MHRA alert_type filter
5. Add pipeline-level 500-item-per-source cap
6. Run verification tests
