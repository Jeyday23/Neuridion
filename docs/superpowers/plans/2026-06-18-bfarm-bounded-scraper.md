# BfArM Bounded Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BfArM searches finish reliably by parsing German dates correctly and stopping pagination once newest-first pages are older than the requested date range.

**Architecture:** Keep the public BfArM scraper interface unchanged. Improve the existing primary HTML scraper in `lib/scrapers/bfarm.ts`; Firecrawl remains a fallback only when the primary scraper yields no usable items. Add unit tests around month parsing and early-stop pagination.

**Tech Stack:** Next.js 16, TypeScript, Vitest, native `fetch`.

## Global Constraints

- Do not change FDA, MHRA, or Swissmedic behavior.
- Do not add dependencies.
- Preserve `ScraperResult` and `ScrapedFsn` shapes.
- Treat zero in-range BfArM matches as a valid result when HTML pages were parsed successfully.
- Keep Firecrawl as a fallback for primary unavailability, not as a normal pagination mechanism.

---

### Task 1: German Date Parsing

**Files:**
- Modify: `lib/scrapers/bfarm.ts`
- Modify: `__tests__/bfarm-year-shortcut.test.ts`

**Interfaces:**
- Consumes: `parsePage(html: string): ParsedItem[]`
- Produces: `parsePage` returns `ParsedItem.date` for German month names including `März` and `M&auml;rz`.

- [ ] **Step 1: Add failing tests**

Add tests that feed minimal BfArM teaser HTML into `parsePage` and assert dates for `März` and `M&auml;rz`.

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run __tests__/bfarm-year-shortcut.test.ts`

Expected: fails because `März` is not parsed.

- [ ] **Step 3: Implement month normalization**

Update `parseGermanDate` so it captures Unicode/entity month text and normalizes common German month spellings before lookup.

- [ ] **Step 4: Verify**

Run: `npx vitest run __tests__/bfarm-year-shortcut.test.ts`

Expected: passes.

### Task 2: Newest-First Early Stop

**Files:**
- Modify: `lib/scrapers/bfarm.ts`
- Create: `__tests__/bfarm-pagination-stop.test.ts`

**Interfaces:**
- Consumes: `scrapeBfArM({ fromDate, toDate })`
- Produces: `scrapeBfArM` stops requesting more pages once a parsed page contains dates older than `fromDate`.

- [ ] **Step 1: Add failing pagination test**

Mock `fetch` so page 1 contains an in-range item and an older item, page 2 would contain only older data. Assert page 2 is never fetched.

- [ ] **Step 2: Run failing test**

Run: `npx vitest run __tests__/bfarm-pagination-stop.test.ts`

Expected: fails because current code fetches page 2.

- [ ] **Step 3: Implement early stop**

In `scrapeBfArM`, after parsing each page, compute page dates. After processing the page, stop pagination if the oldest parsed date is older than `fromDate`.

- [ ] **Step 4: Verify**

Run: `npx vitest run __tests__/bfarm-pagination-stop.test.ts __tests__/bfarm-primary-timeout.test.ts`

Expected: passes.

### Task 3: Final Verification

**Files:**
- Verify all files touched above.

- [ ] **Step 1: Run focused BfArM tests**

Run: `npx vitest run __tests__/bfarm-year-shortcut.test.ts __tests__/bfarm-pagination-stop.test.ts __tests__/bfarm-primary-timeout.test.ts __tests__/unit/pipeline/scrape-stage-timeout.test.ts`

- [ ] **Step 2: Run full tests**

Run: `npx vitest run`

- [ ] **Step 3: Run lint and build**

Run: `npm run lint && npm run build`

- [ ] **Step 4: Commit and push**

Commit message: `fix: bound BfArM pagination`
