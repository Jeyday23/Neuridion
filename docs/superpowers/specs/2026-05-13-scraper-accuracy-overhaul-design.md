# Scraper Accuracy Overhaul — Design Spec

**Date:** 2026-05-13
**Status:** Council-approved
**Author:** Council (4 research agents + 3 debate agents) + Jeremiah (approval)

## Goal

Make the 4 regulatory scrapers (BfArM, FDA MAUDE, MHRA, Swissmedic) return the same results — or better — than a manual search on the government websites, while keeping searches under 10 minutes within the 800-second worker ceiling.

## Background

An accuracy audit of all 4 scrapers revealed that self-imposed caps, fragile title filters, missing API parameters, and silent error handling cause the tool to miss valid FSNs. For a medical device PMS tool used for EU MDR compliance, any truncation is a compliance gap.

A council of 8 specialized agents (4 research + 4 architecture + 3 debate) analyzed each scraper, debated speed vs accuracy tradeoffs, and voted on the final configuration.

## Architecture

11 targeted changes across 6 existing files. No new files, no schema changes, no frontend changes. The pipeline structure is unchanged — fixes are to filters, caps, error handling, and API parameters within the existing architecture.

---

## P0 — Silent Failure Fixes (3 changes)

### 1. Pipeline source failure warning

**File:** `lib/pipeline/run-search.ts`, lines 256-258

**Problem:** When a scraper source fully fails via `Promise.allSettled`, the error is logged to `console.error` but not pushed to `allWarnings`. The run completes as `complete` instead of `degraded`.

**Fix:** In the `else` branch at line 257, push a user-facing warning:
```typescript
} else {
  const sourceLabel = activeSources[i].toUpperCase()
  console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
  allWarnings.push(
    `${sourceLabel} database was unavailable during this search and returned no results.`
  )
}
```

After the loop, check if ALL sources failed and throw:
```typescript
const allFailed = sourceResults.every(r => r.status === 'rejected')
if (allFailed) {
  throw new Error('All selected databases failed. No results could be retrieved.')
}
```

### 2. BfArM title prefix filter removal

**File:** `lib/scrapers/bfarm.ts`, line 114

**Problem:** `if (!title.startsWith('Dringende Sicherheitsinformation')) continue` drops any FSN not starting with that exact German phrase. BfArM also publishes "Wichtige Information", "Sicherheitshinweis", "Korrekturmaßnahme", "Rückruf".

**Fix:** Delete line 114. The URL parameters `cl2Categories_Format=kundeninfo` + `cl2Categories_Rubrik=medizinprodukte` already scope results to medical device Kundeninfos. The `hrefMatch` check on line 108 (`/SharedDocs/Kundeninfos/`) validates the link points to a Kundeninfo document.

**False positive risk:** Near zero. Unlike MHRA (which mixes drug and device alerts), BfArM's URL parameters are a server-side category filter.

### 3. FDA MAUDE silent pagination fix

**File:** `lib/scrapers/fda-maude.ts`, lines 220-232 (fetchPage) and line 109 (pagination loop)

**Problem:** `fetchPage` returns `null` on HTTP error. The pagination loop `break`s on null with no warning. Pages after the failed one are silently lost.

**Fix:** Replace `fetchPage` with a discriminated return type and retry logic:

```typescript
type FetchResult =
  | { ok: true; data: OpenFdaResponse }
  | { ok: false; retriable: false; data: OpenFdaResponse }
  | { ok: false; retriable: true; error: string }
```

3 retry attempts with exponential backoff (1s, 3s, 9s). On 429, respect `Retry-After` header (capped at 60s). On exhaustion, emit a warning to the quarter's warnings array and break:

```
`FDA MAUDE: page at skip=${skip} failed after 3 retries for ${from}–${to}. Some results may be missing.`
```

---

## P1 — API Improvements (4 changes)

### 4. MHRA: API-level alert type filtering

**File:** `lib/scrapers/mhra.ts`, lines 19-28 (URL construction) and lines 49-52 (title filter)

**Problem:** Title-matching (`includes('field safety')`, `includes('medical device alert')`) is fragile and misses non-standard titles.

**Fix:** Replace `filter_format=medical_safety_alert` with:
```
url.searchParams.append('filter_alert_type', 'devices-field-safety-notices')
url.searchParams.append('filter_alert_type', 'devices-medical-device-alerts')
```

Remove the title-based filter at lines 49-52 entirely. The API-level filter uses GOV.UK's internal taxonomy.

### 5. MHRA: Date-range params + chunked pagination

**File:** `lib/scrapers/mhra.ts`

**Problem:** The scraper pages backwards from newest until hitting `fromDate`, wasting requests. The 2,000-offset cap blocks historical searches.

**Fix:**
- Add `filter_public_timestamp[from]` and `[to]` as ISO 8601 timestamps to the URL
- Keep client-side date checks as a safety net (but remove `hitBoundary` early-exit)
- For ranges >180 days, refactor into `scrapeMhraChunk` (single window) and `scrapeMhra` (chunks + dedup):
  - 90-day chunks using `chunkDateRange` from `lib/utils/date-chunks.ts`
  - Sequential chunk processing (GOV.UK rate-limits aggressively)
  - Dedup across chunks by `external_id`

### 6. Scraper cap raises

| Scraper | File | Constant | Old | New |
|---|---|---|---|---|
| BfArM | `bfarm.ts` | `MAX_ITEMS` | 200 | 500 |
| Swissmedic | `swissmedic.ts` | `MAX_ITEMS` | 500 | 2000 |
| Swissmedic | `swissmedic.ts` | `MAX_PAGES` | 50 | 25 |
| Swissmedic | `swissmedic.ts` | page size URL param | (none) | `size=100` |

FDA MAX_ITEMS stays at 500/quarter — with proper search terms, typical queries return 50-200 items. The council's mediator determined this is sufficient.

### 7. Manufacturer terms improvements

**File:** `lib/search/manufacturer-terms.ts`

Three changes:

a) **Raise manufacturer token cap from 2 to 3** (line 46): `meaningful.slice(0, 3)`

b) **Add SHORT_BUT_DISTINCTIVE allowlist** for known short manufacturer names:
```typescript
const SHORT_BUT_DISTINCTIVE = new Set(['3m', 'ge', 'bd', 'hp', 'lg'])
```
Change the filter at line 44 from `t.length >= 2` to `(t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t))`. This raises the default floor from 2 to 3 chars (reducing noise from single-letter tokens like "B" in "B. Braun") while preserving distinctive short names.

c) **Allow 2 device terms instead of 1** (line 67): Replace `.find` with `.filter().slice(0, 2)`:
```typescript
const extras = deviceTokens
  .filter(t => !mfrTerms.includes(t))
  .slice(0, 2)
if (extras.length > 0) return [...new Set([...mfrTerms, ...extras])]
return mfrTerms
```

---

## P1 — Performance Tuning (2 changes)

### 8. Rate limiter throughput increase

**File:** `lib/claude/rate-limiter.ts`, line 3

**Change:** `SONNET_MIN_MS` from 1200 to 1000.

The existing `withRetry` function handles 429 responses with exponential backoff (2s, 4s, 8s, 16s). Reducing the minimum interval from 1200ms to 1000ms increases throughput by ~17%. Even with a 10% 429 retry rate, the net throughput improvement is positive.

### 9. AI filter item cap

**Change:** Set `MAX_FILTER_ITEMS_PER_RUN=500` in environment (currently defaults to 300 via `process.env.MAX_FILTER_ITEMS_PER_RUN ?? '300'`).

The mediator's timing math: 500 items at 0.8s each = 400s. Even worst-case (0% cache, 83s scraping overhead) totals 533s — within the 800s ceiling.

---

## P1 — Pipeline Intelligence (1 change)

### 10. Source-aware manufacturer pre-filter

**File:** `lib/pipeline/run-search.ts`, lines 339-368

**Problem:** The pipeline applies a second round of manufacturer-term filtering after the scrapers already filtered. For FDA (which uses server-side Lucene queries on structured fields), the pipeline's client-side filter uses different field matching and can produce false negatives.

**Fix:** Add `source_db` to the fsn_results select. Create a `TRUST_SOURCE_FILTER` set:
```typescript
const TRUST_SOURCE_FILTER = new Set(['fda'])
```

In the filter loop, skip the pipeline filter for trusted sources:
```typescript
if (TRUST_SOURCE_FILTER.has(row.source_db)) {
  mfrMatched.push(row)
  continue
}
```

This requires adding `source_db` to the select query at line 283.

---

## Deferred to Phase 2

These are approved by the council but deferred:

- **BfArM detail page fetching** — Fetch full FSN content for items classified as "uncertain" by AI. Adds ~30-60s but dramatically improves AI filter accuracy for BfArM.
- **FDA adaptive date chunking** — Binary split date ranges when `meta.results.total > 20,000`. Guarantees 100% API coverage for high-volume manufacturers.

---

## Testing Strategy

- Update `__tests__/manufacturer-terms.test.ts` with cases for: "3M Company" → ["3m"], "GE Healthcare" → ["ge"], "B. Braun Melsungen AG" → ["braun", "melsungen", ...], 3-token cap, 2 device terms
- Each scraper change testable by comparing result counts before/after on known date ranges
- Silent failure: mock a rejected source, assert `allWarnings` contains source label and run status is `degraded`
- FDA retry: mock HTTP 500 sequence, assert retry behavior and warning emission

## Timing Estimates (Council-approved)

| Scenario | Cache | AI items | Total time |
|---|---|---|---|
| Best (repeat search) | 80% | ~6 | ~15 seconds |
| Typical (new device, 1yr) | 40% | ~72 | ~1.5 minutes |
| Worst (broad mfr, no cache) | 0% | ~450 | ~7 minutes |
| Extreme (3yr, generic) | 0% | 500 (cap) | ~8.3 minutes |
