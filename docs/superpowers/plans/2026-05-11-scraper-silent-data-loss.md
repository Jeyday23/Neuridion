# Scraper Silent Data Loss Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BfArM and MHRA scrapers emit warnings when they silently truncate or lose data, so runs show `degraded` instead of `complete` and the coverage table doesn't mark incomplete ranges as covered.

**Architecture:** Add warning emissions at truncation/failure points in two scraper files. The existing pipeline already handles warnings correctly — `run-search.ts:119` gates coverage marking on `warnings.length === 0`, and the run lifecycle marks status as `degraded` when any scraper returns warnings. No new abstractions needed.

**Tech Stack:** TypeScript, Next.js (App Router)

---

### Task 1: BfArM — emit warning on MAX_ITEMS cap

**Files:**
- Modify: `lib/scrapers/bfarm.ts:129-161` (scrapeBfArM function)
- Modify: `lib/scrapers/bfarm.ts:314-321` (scrapeBfarm caller)

- [ ] **Step 1: Change scrapeBfArM return type and add warnings**

Currently `scrapeBfArM()` returns `Promise<ScrapedFsn[]>`. Change it to return `Promise<{ items: ScrapedFsn[], warnings: string[] }>` and emit a warning when the MAX_ITEMS cap is hit.

In `lib/scrapers/bfarm.ts`, replace:

```typescript
export async function scrapeBfArM(options: ScraperOptions = {}): Promise<ScrapedFsn[]> {
  const { fromDate, toDate } = options

  try {
    const raw: ScrapedFsn[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
```

With:

```typescript
export async function scrapeBfArM(options: ScraperOptions = {}): Promise<{ items: ScrapedFsn[], warnings: string[] }> {
  const { fromDate, toDate } = options
  const warnings: string[] = []

  try {
    const raw: ScrapedFsn[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
```

- [ ] **Step 2: Emit warning after the pagination loop**

After line 161 (`if (raw.length >= MAX_ITEMS || pageItems.length < RESULTS_PER_PAGE) break`), after the closing `}` of the for-loop, add:

```typescript
    if (raw.length >= MAX_ITEMS) {
      warnings.push(`BfArM: result set capped at ${MAX_ITEMS} items — additional FSNs may exist for this date range.`)
    }
```

- [ ] **Step 3: Update return statements in scrapeBfArM**

The function currently has two return paths. Replace the return at the end of the try block. Find:

```typescript
  return { items: deduped, warnings, archiveLimitationHit: warnings.length > 0 }
```

This line (300) is inside `scrapeBfarmYearShortcuts`, not `scrapeBfArM`. The `scrapeBfArM` function doesn't currently have an explicit return of the final filtered array — find the last return statement in the try block and the catch block.

Find the section that returns the deduped array (around line 185-190, after the dedup logic). It currently returns a bare `ScrapedFsn[]`. Change all return paths to return `{ items: <the array>, warnings }`.

Specifically, the try block ends with something like:

```typescript
    return deduped
  } catch (err) {
```

Change to:

```typescript
    return { items: deduped, warnings }
  } catch (err) {
```

And the catch block currently re-throws or returns empty. If it returns, change similarly. If it throws, leave it (the outer `scrapeBfarm` catches it).

- [ ] **Step 4: Update the caller in scrapeBfarm**

In the `scrapeBfarm()` entry point (line 316-317), replace:

```typescript
      ? { items: await scrapeBfArM({ fromDate: from, toDate: to }), warnings: [] }
```

With:

```typescript
      ? await scrapeBfArM({ fromDate: from, toDate: to })
```

This forwards the warnings from `scrapeBfArM` instead of hardcoding an empty array.

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Expected: Clean output, exit code 0. If there are type errors, fix them — the return type change may need adjustment in other callers of `scrapeBfArM` (check `firecrawl.ts` which imports `parsePage` but not `scrapeBfArM`).

- [ ] **Step 6: Commit**

```bash
git add lib/scrapers/bfarm.ts
git commit -m "fix(bfarm): emit warning when MAX_ITEMS cap truncates results

Silent truncation at 200 items caused runs to show 'complete' instead
of 'degraded', and poisoned the coverage table so future runs skipped
the incomplete range.

Co-Authored-By: Neuridion"
```

---

### Task 2: MHRA — emit warning on fetchJson failure mid-pagination

**Files:**
- Modify: `lib/scrapers/mhra.ts:10-68` (scrapeMhra pagination loop)

- [ ] **Step 1: Move warnings array above the pagination loop**

The `warnings` array currently lives at line 73 (after pagination). Move it to the top of `scrapeMhra()` so it's available during pagination.

In `lib/scrapers/mhra.ts`, find:

```typescript
export async function scrapeMhra(params: ScraperParams): Promise<ScraperResult> {
  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

  const listings: ScrapedFsn[] = []
  let start = 0
```

Replace with:

```typescript
export async function scrapeMhra(params: ScraperParams): Promise<ScraperResult> {
  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

  const listings: ScrapedFsn[] = []
  const warnings: string[] = []
  let start = 0
```

- [ ] **Step 2: Add warning on fetchJson failure**

Replace the pagination break at lines 30-32:

```typescript
    if (!page?.results?.length) {
      break
    }
```

With:

```typescript
    if (page === null) {
      warnings.push(`MHRA: fetch failed at offset ${start} — results may be incomplete.`)
      break
    }
    if (!page.results?.length) {
      break
    }
```

This distinguishes "fetchJson returned null" (HTTP error — emit warning) from "API returned empty results" (normal end of pagination — no warning).

- [ ] **Step 3: Remove the duplicate warnings declaration**

The old `warnings` declaration at line 73 now conflicts. Find:

```typescript
  const warnings: string[] = []
  if (deduped.length === 0) {
```

Replace with:

```typescript
  if (deduped.length === 0) {
```

The `warnings` array is already declared at the top of the function. The zero-results warning push on the next line still works — it pushes to the same array.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Expected: Clean output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add lib/scrapers/mhra.ts
git commit -m "fix(mhra): emit warning when fetchJson fails mid-pagination

Previously, an HTTP error from GOV.UK caused the pagination loop to
stop silently with no warning. The run showed 'complete' and the
coverage table marked the range as covered despite partial data.

Co-Authored-By: Neuridion"
```

---

### Task 3: Verify coverage gate and final checks

**Files:**
- Read-only: `lib/pipeline/run-search.ts:119` and `lib/pipeline/run-search.ts:181`

- [ ] **Step 1: Verify the coverage gate is complete**

Read `lib/pipeline/run-search.ts` and confirm:
- Line 119: `if (result.warnings.length === 0) fetchedRanges.push(range)` — warnings block coverage marking
- Line 181: `if (canonicalPersisted && !hasManufacturerTerms)` gates `mergeCoverage` on `fetchedRanges`
- No other code path calls `mergeCoverage` outside of this gate

Expected: No code change needed. The gate is correct — it just needed BfArM and MHRA to actually emit warnings.

- [ ] **Step 2: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1`
Expected: Clean output, exit code 0.

- [ ] **Step 3: Verify git status**

Run: `git status`
Expected: Clean working tree (all changes committed in Tasks 1-2).

Run: `git log --oneline -3`
Expected: Two new commits for the BfArM and MHRA fixes.

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

- [ ] **Step 5: Post-build verification**

Run the post-build security audit pattern (4 parallel agents) to verify:
- No regressions in TypeScript
- No accidental changes to other scraper files
- Warning strings don't leak internal details (they don't — they describe the cap/failure generically)
- Git is clean and synced
