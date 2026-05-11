# Scraper Silent Data Loss Fixes — Design Spec

**Date:** 2026-05-11
**Scope:** Tier 1 only — silent data loss bugs
**Approach:** A+ (Warnings + verify coverage guard)
**Estimated diff:** ~10 lines across 3 files

## Problem

Four bugs cause the scraper pipeline to silently lose FSN data without marking runs as `degraded`:

1. **BfArM MAX_ITEMS=200 cap** — `scrapeBfArM()` breaks out of the loop at line 160 of `bfarm.ts` when `raw.length >= MAX_ITEMS` but emits no warning. The entry point `scrapeBfarm()` at line 317 wraps this in `{ items, warnings: [] }`, so zero warnings flow to the pipeline.
2. **MHRA fetchJson null** — `fetchJson()` at line 139 of `mhra.ts` returns `null` on any HTTP error. The pagination loop at line 30 checks `!page?.results?.length` and breaks — indistinguishable from "no more pages."
3. **Coverage poisoning** — `run-search.ts` line 119 gates coverage marking on `result.warnings.length === 0`. This is correct, but only works if bugs 1 and 2 actually emit warnings. Currently they don't, so truncated ranges get marked as "covered" and future runs skip them.
4. **No retry** — Deferred to a future iteration. The coverage guard provides implicit retry: unmarked ranges get re-fetched on the next user-initiated run.

## Design

### Fix 1: BfArM — emit warning on MAX_ITEMS cap

**File:** `lib/scrapers/bfarm.ts`
**Location:** Inside `scrapeBfArM()`, after the pagination loop exits (after line 161)

Add a check: if `raw.length >= MAX_ITEMS`, push a warning string to a local warnings array. Return `{ items, warnings }` instead of bare items.

The caller `scrapeBfarm()` at line 317 currently wraps the result as `{ items: await scrapeBfArM(...), warnings: [] }`. Change this to accept and forward the warnings from `scrapeBfArM()`.

**Warning text:** `BfArM: result set capped at ${MAX_ITEMS} items — additional FSNs may exist for this date range. Run marked as degraded.`

**Also check:** The year-shortcut path (`scrapeBfarmYearShortcuts`) already has its own warnings array (line 250) and the entry point at line 318 calls it directly returning a `ScraperResult`. No change needed for the year path.

### Fix 2: MHRA — emit warning on fetchJson failure mid-pagination

**File:** `lib/scrapers/mhra.ts`
**Location:** Inside `scrapeMhra()`, at the pagination break on line 30

Currently:
```typescript
if (!page?.results?.length) {
  break
}
```

Change to distinguish "no results" (normal end of pagination) from "fetch failed" (HTTP error). When `page` is `null` (fetchJson returned null) AND `start > 0` (we already got at least one page), emit a warning before breaking.

**Warning text:** `MHRA: fetch failed at offset ${start} — results may be incomplete. Run marked as degraded.`

When `start === 0` and `page` is null, the first page failed entirely. This should also emit a warning:
`MHRA: initial fetch failed — no results retrieved. Run marked as degraded.`

Create a local `warnings: string[]` array at the top of `scrapeMhra()` and return it in the `ScraperResult`.

### Fix 3: Verify coverage guard

**File:** `lib/pipeline/run-search.ts`
**Location:** Line 119

The existing gate `if (result.warnings.length === 0) fetchedRanges.push(range)` is correct. Once fixes 1 and 2 emit warnings, this gate will prevent coverage marking for truncated/failed ranges.

**Verification needed:** Confirm that `fetchedRanges` is the only path to `mergeCoverage`. Check that no other code path marks coverage independently. If the gate is complete, no code change is needed here — just verification.

### Fix 4: BfArM scrapeBfArM return type change

**File:** `lib/scrapers/bfarm.ts`

`scrapeBfArM()` currently returns `ScrapedFsn[]` (bare array). Change it to return `{ items: ScrapedFsn[], warnings: string[] }` so warnings can flow through.

Update the caller at line 317:
```
// Before:
{ items: await scrapeBfArM({ fromDate: from, toDate: to }), warnings: [] }
// After:
await scrapeBfArM({ fromDate: from, toDate: to })
```

This is the only structural change — everything else is adding `warnings.push(...)` calls.

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `lib/scrapers/bfarm.ts` | Add warnings array to `scrapeBfArM()`, emit on MAX_ITEMS cap, change return type | ~6 lines |
| `lib/scrapers/mhra.ts` | Add warnings array to `scrapeMhra()`, emit on fetchJson null | ~4 lines |
| `lib/pipeline/run-search.ts` | Verify coverage gate (likely no change) | 0 lines |

## What This Does NOT Change

- No retry logic added (deferred — coverage guard provides implicit run-level retry)
- No MAX_ITEMS cap changes (200 stays as-is)
- No HTML parsing changes
- No coverage.ts changes
- No changes to FDA or Swissmedic scrapers (they already emit warnings on their caps)

## Testing

- `npx tsc --noEmit` — TypeScript must pass
- Manual verification: read the diff and confirm warnings flow to `ScraperResult.warnings`
- The existing pipeline handles `degraded` status correctly — no UI changes needed

## Success Criteria

After this change:
- A BfArM search that hits 200+ items shows `degraded` status instead of `complete`
- An MHRA search where GOV.UK returns a 500 mid-pagination shows `degraded` instead of `complete`
- Neither truncated range gets marked as "covered" in `sync_coverage`, so the next run re-fetches it
