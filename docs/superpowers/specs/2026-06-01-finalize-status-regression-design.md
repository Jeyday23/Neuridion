# Fix Pipeline Finalize Status Regression

**Date:** 2026-06-01
**Status:** Approved
**Genius Council:** Unanimous (5/5 lenses aligned)

## Problem

The per-source streaming refactor (commit `4b92fbc`) changed `scrapeStage` to reset `ctx.items = []` after each source inserts its results into the DB via `insertResultsStage`. This reduced OOM risk but broke a downstream invariant: `finalizeStage` and `run-search.ts` read `ctx.items.length` to determine run status, populate DB columns, and write audit logs.

Since `ctx.items` is now always empty by the time finalize runs, `computeRunStatus(ctx.warnings, 0)` returns `'error'` whenever warnings exist (which they always do — even informational ones from scraper sources). Production runs that scrape 179+ items and complete all stages are incorrectly marked as `'error'`.

## Root Cause

`ctx.items` changed from **accumulator** (grows across all sources) to **transient buffer** (filled then drained per-source). The correct accumulator is `ctx.insertedRows`, which `insertResultsStage` appends to across all source calls.

## Fix

Replace 4 references from `ctx.items.length` to `ctx.insertedRows.length`:

| File | Line | Context |
|------|------|---------|
| `lib/pipeline/stages/finalize.ts` | 20 | `computeRunStatus()` — determines run status |
| `lib/pipeline/stages/finalize.ts` | 31 | `total_scraped` DB column |
| `lib/pipeline/stages/finalize.ts` | 42 | `result_count` in audit log |
| `lib/pipeline/run-search.ts` | 141 | `timing.total_items_scraped` metadata |

## Test

Add `__tests__/compute-run-status.test.ts` with 5 cases:

1. No warnings, items > 0 → `'complete'`
2. No warnings, items = 0 → `'complete'`
3. Warnings + items > 0 → `'degraded'`
4. Warnings + items = 0, all info-only (matching `/returned 0|no .* found/i`) → `'complete'`
5. Warnings + items = 0, non-info warnings → `'error'`

## What Doesn't Change

- No schema changes
- No new dependencies
- No behavior change to scrape/filter/persist stages
- Email notification (already `.catch()`-wrapped) unrelated
- `computeRunStatus()` logic itself is correct — it just receives wrong input

## Verification

- `npx tsc --noEmit` — zero errors
- `npx vitest run __tests__/compute-run-status.test.ts` — all 5 cases green
- Next production run should show `'complete'` or `'degraded'` instead of `'error'`
