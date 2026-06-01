# Fix Pipeline Finalize Status Regression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix false `'error'` run status caused by `ctx.items.length` being 0 after per-source streaming, and add regression tests for `computeRunStatus()`.

**Architecture:** Replace 4 stale `ctx.items.length` references with `ctx.insertedRows.length` (the correct accumulator). Add a unit test file for the pure `computeRunStatus()` function which is already exported.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `__tests__/compute-run-status.test.ts` | Create | Unit tests for `computeRunStatus()` |
| `lib/pipeline/stages/finalize.ts` | Modify lines 20, 31, 42 | Fix 3 stale `ctx.items.length` refs |
| `lib/pipeline/run-search.ts` | Modify line 141 | Fix 1 stale `ctx.items.length` ref |

---

### Task 1: Write unit tests for computeRunStatus()

**Files:**
- Create: `__tests__/compute-run-status.test.ts`
- Reference (do not modify): `lib/pipeline/stages/finalize.ts:5-12`

The function under test is already exported from `lib/pipeline/stages/finalize.ts`:

```typescript
export function computeRunStatus(warnings: string[], itemCount: number): 'complete' | 'degraded' | 'error' {
  if (warnings.length > 0 && itemCount === 0) {
    const isInfoOnly = warnings.every(w => /returned 0|no .* found/i.test(w))
    return isInfoOnly ? 'complete' : 'error'
  }
  if (warnings.length > 0) return 'degraded'
  return 'complete'
}
```

- [ ] **Step 1: Write the test file**

Create `__tests__/compute-run-status.test.ts` with this exact content:

```typescript
import { describe, it, expect } from 'vitest'
import { computeRunStatus } from '@/lib/pipeline/stages/finalize'

describe('computeRunStatus', () => {
  it('returns complete when no warnings and items > 0', () => {
    expect(computeRunStatus([], 179)).toBe('complete')
  })

  it('returns complete when no warnings and items = 0', () => {
    expect(computeRunStatus([], 0)).toBe('complete')
  })

  it('returns degraded when warnings exist and items > 0', () => {
    expect(computeRunStatus(['MHRA database was unavailable during this search and returned no results.'], 150)).toBe('degraded')
  })

  it('returns complete when warnings are info-only and items = 0', () => {
    expect(computeRunStatus(['BfArM returned 0 results for this date range'], 0)).toBe('complete')
    expect(computeRunStatus(['No matching FSNs found for this device'], 0)).toBe('complete')
  })

  it('returns error when non-info warnings and items = 0', () => {
    expect(computeRunStatus(['scrapeStage failed: Pipeline stage error.'], 0)).toBe('error')
    expect(computeRunStatus(['MHRA database was unavailable during this search and returned no results.'], 0)).toBe('error')
  })
})
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npx vitest run __tests__/compute-run-status.test.ts`

Expected: All 5 tests PASS. These test the existing `computeRunStatus()` function which is already correct — the bug is in what values are passed to it, not in the function itself.

- [ ] **Step 3: Commit the tests**

```bash
git add __tests__/compute-run-status.test.ts
git commit -m "test: add unit tests for computeRunStatus() pipeline status logic

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 2: Fix stale ctx.items.length references

**Files:**
- Modify: `lib/pipeline/stages/finalize.ts:20,31,42`
- Modify: `lib/pipeline/run-search.ts:141`

**Context:** After the per-source streaming refactor (commit `4b92fbc`), `ctx.items` is reset to `[]` after each source inserts. The correct accumulator is `ctx.insertedRows` which grows across all source inserts. The 4 lines below still read `ctx.items.length` and must be changed to `ctx.insertedRows.length`.

- [ ] **Step 1: Fix finalize.ts line 20 — status computation**

In `lib/pipeline/stages/finalize.ts`, find line 20:

```typescript
  const runStatus = computeRunStatus(ctx.warnings, ctx.items.length)
```

Replace with:

```typescript
  const runStatus = computeRunStatus(ctx.warnings, ctx.insertedRows.length)
```

- [ ] **Step 2: Fix finalize.ts line 31 — total_scraped DB column**

In `lib/pipeline/stages/finalize.ts`, find line 31:

```typescript
    total_scraped:       ctx.items.length,
```

Replace with:

```typescript
    total_scraped:       ctx.insertedRows.length,
```

- [ ] **Step 3: Fix finalize.ts line 42 — audit log result_count**

In `lib/pipeline/stages/finalize.ts`, find line 42:

```typescript
    result_count:   ctx.items.length,
```

Replace with:

```typescript
    result_count:   ctx.insertedRows.length,
```

- [ ] **Step 4: Fix run-search.ts line 141 — timing metadata**

In `lib/pipeline/run-search.ts`, find line 141:

```typescript
    ctx.timing.total_items_scraped = ctx.items.length
```

Replace with:

```typescript
    ctx.timing.total_items_scraped = ctx.insertedRows.length
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: Zero errors. Both `ctx.items` and `ctx.insertedRows` are arrays, so `.length` is valid on both — this is a pure logic fix, not a type fix.

- [ ] **Step 6: Run the unit tests**

Run: `npx vitest run __tests__/compute-run-status.test.ts`

Expected: All 5 tests still PASS (the tests exercise the pure function, not the call sites).

- [ ] **Step 7: Commit the fix**

```bash
git add lib/pipeline/stages/finalize.ts lib/pipeline/run-search.ts
git commit -m "fix: use insertedRows.length instead of items.length in finalize stage

ctx.items is now a transient buffer cleared after each source inserts.
ctx.insertedRows is the correct accumulator across all sources.
Fixes false 'error' status on successful pipeline runs.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```
