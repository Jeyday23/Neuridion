# Fix Remaining Stale ctx.items References

**Date:** 2026-06-02
**Status:** Approved
**Genius Council:** Unanimous (5/5 lenses aligned)

## Problem

Three stale `ctx.items` references remain from the per-source streaming refactor (commit `4b92fbc`). These were identified by the code quality review in the prior session.

## Fixes

### Fix 1: BfArM Enrichment Lookup (functional bug)
- `filter.ts:195` — `ctx.items.find()` always returns `undefined` since `ctx.items` is empty during filter stage
- `InsertedFsnRow` type lacks `source_url` field needed by the enrichment lookup
- Add `source_url` to type, `.select()` query, and switch to `ctx.insertedRows.find()`

### Fix 2: Progress Callbacks (UI display bug)
- `filter.ts:92,169` — `items_found: ctx.items.length` always reports 0
- Change to `ctx.insertedRows.length`

### Fix 3: Debug Log (observability bug)
- `run-search.ts:117` — `items=${ctx.items.length}` always logs 0 after scrape stage
- Change to `ctx.insertedRows.length`

## Files Changed

| File | Lines | Change |
|------|-------|--------|
| `lib/pipeline/types.ts` | 34-42 | Add `source_url: string \| null` to `InsertedFsnRow` |
| `lib/pipeline/stages/insert-results.ts` | 28 | Add `source_url` to `.select()` |
| `lib/pipeline/stages/filter.ts` | 92, 169 | `ctx.items.length` → `ctx.insertedRows.length` |
| `lib/pipeline/stages/filter.ts` | 195 | `ctx.items.find(...)` → `ctx.insertedRows.find(...)` |
| `lib/pipeline/run-search.ts` | 117 | `ctx.items.length` → `ctx.insertedRows.length` |

## Verification

- `npx tsc --noEmit` — zero errors
- `npx vitest run` — no regressions
- No remaining stale `ctx.items` references outside of scrape.ts and insert-results.ts (where they are correct)
