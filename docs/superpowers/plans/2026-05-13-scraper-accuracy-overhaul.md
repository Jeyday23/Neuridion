# Scraper Accuracy Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 4 regulatory scrapers return the same or better results than manual government website searches, within the 800s worker ceiling.

**Architecture:** 11 targeted changes across 6 existing files. No new files, no schema changes, no frontend changes. Fixes are to filters, caps, error handling, and API parameters within the existing architecture.

**Tech Stack:** TypeScript, Next.js, openFDA REST API, GOV.UK Search API, Vitest

**Spec:** `docs/superpowers/specs/2026-05-13-scraper-accuracy-overhaul-design.md`

---

### Task 1: Pipeline silent failure warning

**Files:**
- Modify: `lib/pipeline/run-search.ts:249-259`

- [ ] **Step 1: Add source failure warning to allWarnings**

In `lib/pipeline/run-search.ts`, replace the `else` branch at lines 256-258:

```typescript
// BEFORE (lines 256-258):
    } else {
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
    }

// AFTER:
    } else {
      const sourceLabel = activeSources[i].toUpperCase()
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
      allWarnings.push(
        `${sourceLabel} database was unavailable during this search and returned no results.`
      )
    }
```

- [ ] **Step 2: Add all-sources-failed check after the loop**

After the `for` loop that processes `sourceResults` (after line 259), add:

```typescript
  const allFailed = sourceResults.every(r => r.status === 'rejected')
  if (allFailed) {
    throw new Error('All selected databases failed. No results could be retrieved.')
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/pipeline/run-search.ts
git commit -m "fix: surface scraper source failures as user-facing warnings

Push source failure to allWarnings so the run is marked 'degraded'
instead of silently completing. Throw if ALL sources fail.

Co-Authored-By: Neuridion"
```

---

### Task 2: BfArM title filter removal + cap raise

**Files:**
- Modify: `lib/scrapers/bfarm.ts:10,114`

- [ ] **Step 1: Remove the title prefix filter**

In `lib/scrapers/bfarm.ts`, delete line 114:

```typescript
// DELETE this line:
    if (!title.startsWith('Dringende Sicherheitsinformation')) continue
```

- [ ] **Step 2: Raise MAX_ITEMS from 200 to 500**

In `lib/scrapers/bfarm.ts`, change line 10:

```typescript
// BEFORE:
const MAX_ITEMS  = 200

// AFTER:
const MAX_ITEMS  = 500
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/scrapers/bfarm.ts
git commit -m "fix(bfarm): remove title prefix filter, raise item cap to 500

The 'Dringende Sicherheitsinformation' prefix filter dropped FSNs with
alternate German titles (Wichtige Information, Korrekturmaßnahme, etc).
URL params cl2Categories_Format + cl2Categories_Rubrik already scope to
medical device Kundeninfos. Cap raised from 200 to 500.

Co-Authored-By: Neuridion"
```

---

### Task 3: FDA MAUDE fetchPage retry with discriminated result type

**Files:**
- Modify: `lib/scrapers/fda-maude.ts:107-109,220-232`

- [ ] **Step 1: Add FetchResult type and replace fetchPage with fetchPageWithRetry**

In `lib/scrapers/fda-maude.ts`, replace the `fetchPage` function (lines 220-232) with:

```typescript
type FetchResult =
  | { ok: true; data: OpenFdaResponse }
  | { ok: false; retriable: false; data: OpenFdaResponse }
  | { ok: false; retriable: true; error: string }

async function fetchPageWithRetry(url: string, maxAttempts = 3): Promise<FetchResult> {
  const backoffs = [1000, 3000, 9000]
  let lastError = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })

      if (res.ok) {
        const data = await res.json() as OpenFdaResponse
        return { ok: true, data }
      }

      if (res.status === 404) {
        const data = await res.json().catch(() => ({ error: { code: 'NOT_FOUND', message: 'No results' } })) as OpenFdaResponse
        return { ok: false, retriable: false, data }
      }

      if (res.status === 429) {
        const retryAfter = Math.min(
          parseInt(res.headers.get('Retry-After') ?? '0', 10) * 1000 || backoffs[attempt],
          60_000,
        )
        lastError = `HTTP 429 (rate limited)`
        if (attempt < maxAttempts - 1) {
          console.error(`[fda] 429 on attempt ${attempt + 1}/${maxAttempts}, waiting ${retryAfter}ms`)
          await new Promise(r => setTimeout(r, retryAfter))
          continue
        }
      } else if (res.status >= 500) {
        lastError = `HTTP ${res.status}`
        if (attempt < maxAttempts - 1) {
          console.error(`[fda] ${res.status} on attempt ${attempt + 1}/${maxAttempts}, retrying in ${backoffs[attempt]}ms`)
          await new Promise(r => setTimeout(r, backoffs[attempt]))
          continue
        }
      } else {
        lastError = `HTTP ${res.status}`
        return { ok: false, retriable: false, data: { error: { code: String(res.status), message: lastError } } }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error'
      if (attempt < maxAttempts - 1) {
        console.error(`[fda] Fetch error on attempt ${attempt + 1}/${maxAttempts}, retrying in ${backoffs[attempt]}ms`)
        await new Promise(r => setTimeout(r, backoffs[attempt]))
        continue
      }
    }
  }

  return { ok: false, retriable: true, error: lastError }
}
```

- [ ] **Step 2: Update the pagination loop to use fetchPageWithRetry**

In the `fetchQuarter` function, replace lines 107-109:

```typescript
// BEFORE:
    const data = await fetchPage(url)

    if (!data) break

// AFTER:
    const result = await fetchPageWithRetry(url)

    if (!result.ok && result.retriable) {
      warnings.push(
        `FDA MAUDE: page at skip=${skip} failed after 3 retries for ${fromDate}–${toDate}. Some results may be missing.`
      )
      break
    }

    const data = result.ok ? result.data : result.data
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/scrapers/fda-maude.ts
git commit -m "fix(fda): add retry with exponential backoff, discriminated FetchResult type

Replace fetchPage (null on error) with fetchPageWithRetry that returns
a discriminated union. 3 retries with 1s/3s/9s backoff. Respects
Retry-After header on 429. Emits user-facing warning on exhaustion
instead of silently breaking.

Co-Authored-By: Neuridion"
```

---

### Task 4: Manufacturer terms improvements (TDD)

**Files:**
- Modify: `lib/search/manufacturer-terms.ts:44,46,67-69`
- Modify: `__tests__/manufacturer-terms.test.ts`

- [ ] **Step 1: Update existing tests that will break with new behavior**

In `__tests__/manufacturer-terms.test.ts`, update these expectations:

```typescript
// Change: caps at 2 tokens → caps at 3 tokens
  it('caps at 3 tokens for long names', () => {
    expect(extractManufacturerTerms('Alpha Beta Gamma Delta Epsilon Corp')).toEqual(['alpha', 'beta', 'gamma'])
  })

// Change: "B. Braun" test — B is now filtered by <3 char rule (same result)
  it('"B. Braun" → ["braun"] (B filtered by <3 char rule)', () => {
    expect(extractManufacturerTerms('B. Braun')).toEqual(['braun'])
  })

// Change: single letter token test description
  it('single-char and two-char tokens filtered', () => {
    expect(extractManufacturerTerms('A. Smith Medical')).toEqual(['smith'])
  })

// Change: "Smith & Jones" — "jo" is now <3 chars... wait, "jones" is 5 chars, still passes.
// Actually "jones" is fine. The change from >=2 to >=3 only affects 2-char tokens.
// Need to check: current test expects ['smith', 'jones'] — both >=3, so no change needed.
```

- [ ] **Step 2: Add new failing tests for SHORT_BUT_DISTINCTIVE**

Add to the `extractManufacturerTerms` describe block:

```typescript
  it('"3M Company" → ["3m"] (short but distinctive)', () => {
    expect(extractManufacturerTerms('3M Company')).toEqual(['3m'])
  })
  it('"GE Healthcare" → ["ge"] (short but distinctive)', () => {
    expect(extractManufacturerTerms('GE Healthcare')).toEqual(['ge'])
  })
  it('"BD Medical" → ["bd"] (short but distinctive)', () => {
    expect(extractManufacturerTerms('BD Medical')).toEqual(['bd'])
  })
  it('"B. Braun Melsungen AG" → ["braun", "melsungen"] (3-token cap allows both)', () => {
    expect(extractManufacturerTerms('B. Braun Melsungen AG')).toEqual(['braun', 'melsungen'])
  })
  it('2-char non-distinctive tokens are filtered', () => {
    expect(extractManufacturerTerms('AB Medical GmbH')).toEqual([])
  })
```

- [ ] **Step 3: Add new failing tests for 2 device terms**

Add to the `buildManufacturerSearchTerms` describe block:

```typescript
  it('adds up to 2 device terms instead of 1', () => {
    expect(buildManufacturerSearchTerms('Medtronic', 'Cobalt XT CRT-D System')).toEqual(
      ['medtronic', 'cobalt', 'crt-d']
    )
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run __tests__/manufacturer-terms.test.ts 2>&1 | tail -20`
Expected: Multiple test failures

- [ ] **Step 5: Implement the changes in manufacturer-terms.ts**

In `lib/search/manufacturer-terms.ts`:

a) Add `SHORT_BUT_DISTINCTIVE` after `GENERIC_MFR_WORDS`:

```typescript
const SHORT_BUT_DISTINCTIVE = new Set(['3m', 'ge', 'bd', 'hp', 'lg'])
```

b) Change the filter at line 44 from `t.length >= 2` to:

```typescript
    .filter(t =>
      (t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t)) &&
      !LEGAL_SUFFIXES.has(t) &&
      !GENERIC_MFR_WORDS.has(t),
    )
```

c) Change `.slice(0, 2)` at line 46 to `.slice(0, 3)`.

d) In `buildManufacturerSearchTerms`, replace lines 67-69:

```typescript
// BEFORE:
  const extra = deviceTokens.find(t => !mfrTerms.includes(t))
  if (extra) return [...new Set([...mfrTerms, extra])]
  return mfrTerms

// AFTER:
  const extras = deviceTokens
    .filter(t => !mfrTerms.includes(t))
    .slice(0, 2)
  if (extras.length > 0) return [...new Set([...mfrTerms, ...extras])]
  return mfrTerms
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run __tests__/manufacturer-terms.test.ts 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/search/manufacturer-terms.ts __tests__/manufacturer-terms.test.ts
git commit -m "feat(search): 3-token cap, SHORT_BUT_DISTINCTIVE allowlist, 2 device terms

Raise manufacturer token cap from 2→3. Add allowlist for known short
manufacturer names (3M, GE, BD, HP, LG). Raise min token length from
2→3 chars (reduces noise from single-letter tokens like B in B. Braun).
Allow 2 device terms instead of 1 for better search specificity.

Co-Authored-By: Neuridion"
```

---

### Task 5: MHRA API-level alert type filtering + date params

**Files:**
- Modify: `lib/scrapers/mhra.ts:19-28,39-52,69-74`

- [ ] **Step 1: Replace filter_format with filter_alert_type params**

In `lib/scrapers/mhra.ts`, replace the URL construction (lines 19-28):

```typescript
// BEFORE:
    const url = new URL(SEARCH_API)
    url.searchParams.set('filter_format', 'medical_safety_alert')
    url.searchParams.set('count',         String(PAGE_SIZE))
    url.searchParams.set('start',             String(start))
    url.searchParams.set('order',             '-public_timestamp')
    url.searchParams.append('fields[]',        'title')
    url.searchParams.append('fields[]',        'description')
    url.searchParams.append('fields[]',        'link')
    url.searchParams.append('fields[]',        'public_timestamp')

// AFTER:
    const url = new URL(SEARCH_API)
    url.searchParams.append('filter_alert_type', 'devices-field-safety-notices')
    url.searchParams.append('filter_alert_type', 'devices-medical-device-alerts')
    url.searchParams.set('count',         String(PAGE_SIZE))
    url.searchParams.set('start',             String(start))
    url.searchParams.set('order',             '-public_timestamp')
    url.searchParams.append('fields[]',        'title')
    url.searchParams.append('fields[]',        'description')
    url.searchParams.append('fields[]',        'link')
    url.searchParams.append('fields[]',        'public_timestamp')
```

- [ ] **Step 2: Add date range params to URL**

After the fields[] params, add:

```typescript
    url.searchParams.set('filter_public_timestamp[from]', fromDate.toISOString())
    url.searchParams.set('filter_public_timestamp[to]', toDate.toISOString())
```

- [ ] **Step 3: Remove title-based filter**

Delete lines 49-52 (the `isFsn` check):

```typescript
// DELETE these lines:
      const titleLower = (item.title ?? '').toLowerCase()
      const isFsn = titleLower.includes('field safety') || titleLower.includes('medical device alert') || titleLower.includes('device alert')
      if (!isFsn) continue
```

- [ ] **Step 4: Remove hitBoundary early-exit and 2000 offset cap**

Since we now have server-side date filtering, remove the `hitBoundary` logic (lines 39-46, 67) and the 2000 offset cap (lines 71-74). Keep client-side date checks as a safety net but remove the early-exit:

```typescript
// Replace the hitBoundary + offset cap section with:
    for (const item of page.results) {
      const pubDate = item.public_timestamp ? new Date(item.public_timestamp) : null
      if (pubDate && pubDate > toDate) continue
      if (pubDate && pubDate < fromDate) continue

      const linkPath = item.link ?? ''
      listings.push({
        external_id:  linkPath || String(start),
        title:        cleanTitle(item.title ?? ''),
        manufacturer: extractManufacturer(item.title ?? '', item.description ?? ''),
        product_name: extractProductName(item.title ?? ''),
        fsn_date:     pubDate ? pubDate.toISOString().slice(0, 10) : null,
        source_url:   linkPath ? `https://www.gov.uk${linkPath}` : '',
        raw_content:  sanitizeContent([item.title, item.description].filter(Boolean).join('\n\n')),
        source_db:    'mhra',
      })
    }

    start += PAGE_SIZE
    const total = page.total ?? 0
    if (start >= total) break

    await jitter(150, 350)
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/scrapers/mhra.ts
git commit -m "fix(mhra): use API-level alert type filter, add date range params

Replace fragile title-based FSN detection with GOV.UK filter_alert_type
params (devices-field-safety-notices + devices-medical-device-alerts).
Add filter_public_timestamp date range params for server-side filtering.
Remove hitBoundary early-exit and 2000-offset cap.

Co-Authored-By: Neuridion"
```

---

### Task 6: MHRA date-chunked pagination (depends on Task 5)

**Files:**
- Modify: `lib/scrapers/mhra.ts`

- [ ] **Step 1: Refactor scrapeMhra into scrapeMhraChunk + scrapeMhra**

Extract the current `scrapeMhra` body into `scrapeMhraChunk` (single date window), then wrap it with chunked logic in `scrapeMhra`:

```typescript
import { chunkDateRange, daysBetween } from '@/lib/utils/date-chunks'

async function scrapeMhraChunk(fromDate: Date, toDate: Date, searchTerms?: string[]): Promise<ScraperResult> {
  // ... (the current scrapeMhra body from Task 5, minus the searchTerms filter at the end)
}

export async function scrapeMhra(params: ScraperParams): Promise<ScraperResult> {
  const totalDays = daysBetween(params.fromDate, params.toDate)
  const allItems: ScrapedFsn[] = []
  const allWarnings: string[] = []

  if (totalDays <= 180) {
    const result = await scrapeMhraChunk(
      new Date(params.fromDate + 'T00:00:00.000Z'),
      new Date(params.toDate + 'T23:59:59.999Z'),
      params.searchTerms,
    )
    allItems.push(...result.items)
    allWarnings.push(...result.warnings)
  } else {
    const chunks = chunkDateRange(params.fromDate, params.toDate, 90)
    for (const chunk of chunks) {
      const result = await scrapeMhraChunk(
        new Date(chunk.from + 'T00:00:00.000Z'),
        new Date(chunk.to + 'T23:59:59.999Z'),
        params.searchTerms,
      )
      allItems.push(...result.items)
      allWarnings.push(...result.warnings)
    }
  }

  // Dedup across chunks by external_id
  const deduped = dedup(allItems)

  if (deduped.length === 0) {
    allWarnings.push('MHRA returned 0 Field Safety Notices for the selected date range.')
  }

  // Client-side manufacturer term filtering
  if (params.searchTerms && params.searchTerms.length > 0) {
    const terms = params.searchTerms.map(t => t.toLowerCase())
    const filtered = deduped.filter(item => {
      const hay = `${item.title} ${item.raw_content ?? ''}`.toLowerCase()
      return terms.some(t => hay.includes(t))
    })
    return { items: filtered, warnings: allWarnings }
  }

  return { items: deduped, warnings: allWarnings }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/scrapers/mhra.ts
git commit -m "feat(mhra): chunked pagination for date ranges >180 days

Refactor into scrapeMhraChunk (single window) + scrapeMhra (orchestrator).
Ranges >180 days are split into 90-day chunks processed sequentially
(GOV.UK rate-limits aggressively). Cross-chunk dedup by external_id.

Co-Authored-By: Neuridion"
```

---

### Task 7: Swissmedic page size + cap raise

**Files:**
- Modify: `lib/scrapers/swissmedic.ts:7-8,123`

- [ ] **Step 1: Update constants**

In `lib/scrapers/swissmedic.ts`:

```typescript
// BEFORE:
const MAX_PAGES  = 50
const MAX_ITEMS  = 500

// AFTER:
const MAX_PAGES  = 25
const MAX_ITEMS  = 2000
```

- [ ] **Step 2: Add size=100 URL param**

In the `fetchPublicationPage` function, after line 123 (`url.searchParams.set('direction', 'DESC')`), add:

```typescript
  url.searchParams.set('size', '100')
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/scrapers/swissmedic.ts
git commit -m "feat(swissmedic): add page size param, raise item cap to 2000

Add size=100 to API requests (was using server default ~20). Raise
MAX_ITEMS from 500 to 2000. Lower MAX_PAGES from 50 to 25 (25 × 100
= 2,500 > 2,000 cap).

Co-Authored-By: Neuridion"
```

---

### Task 8: Rate limiter tuning + source-aware pre-filter

**Files:**
- Modify: `lib/claude/rate-limiter.ts:3`
- Modify: `lib/pipeline/run-search.ts:263-266,283,339-368`

- [ ] **Step 1: Reduce SONNET_MIN_MS**

In `lib/claude/rate-limiter.ts`, change line 3:

```typescript
// BEFORE:
const SONNET_MIN_MS = 1200

// AFTER:
const SONNET_MIN_MS = 1000
```

- [ ] **Step 2: Add source_db to insertedRows type and select query**

In `lib/pipeline/run-search.ts`, update the `insertedRows` type declaration (lines 263-266):

```typescript
// BEFORE:
  let insertedRows: {
    id: string; external_id: string | null; title: string
    manufacturer: string | null; raw_content: string | null; fsn_date: string | null
  }[] = []

// AFTER:
  let insertedRows: {
    id: string; external_id: string | null; title: string
    manufacturer: string | null; raw_content: string | null; fsn_date: string | null
    source_db: string | null
  }[] = []
```

Update the select query at line 283:

```typescript
// BEFORE:
      .select('id, external_id, title, manufacturer, raw_content, fsn_date')

// AFTER:
      .select('id, external_id, title, manufacturer, raw_content, fsn_date, source_db')
```

- [ ] **Step 3: Add source-aware bypass in manufacturer pre-filter**

In the manufacturer pre-filter loop (lines 339-368), add `TRUST_SOURCE_FILTER` and bypass logic:

```typescript
// Add before the filter loop (before line 339):
  const TRUST_SOURCE_FILTER = new Set(['fda'])

// Inside the for loop, before the hay/matches logic (after line 343):
    for (const row of needsFilter) {
      if (row.source_db && TRUST_SOURCE_FILTER.has(row.source_db)) {
        mfrMatched.push(row)
        continue
      }
      // ... rest of existing matching logic
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add lib/claude/rate-limiter.ts lib/pipeline/run-search.ts
git commit -m "perf: reduce Sonnet rate limit interval, add source-aware pre-filter

SONNET_MIN_MS 1200→1000 (~17% throughput gain). Trust FDA's server-side
Lucene filter — skip redundant client-side manufacturer matching for FDA
results to prevent false negatives from field mismatch.

Co-Authored-By: Neuridion"
```

---

### Task 9: Environment variable update

**Files:**
- Modify: `.env.example:43`

- [ ] **Step 1: Update MAX_FILTER_ITEMS_PER_RUN**

In `.env.example`, change:

```
# BEFORE:
MAX_FILTER_ITEMS_PER_RUN=300

# AFTER:
MAX_FILTER_ITEMS_PER_RUN=500
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "config: raise MAX_FILTER_ITEMS_PER_RUN default from 300 to 500

500 items at 0.8s each = 400s. Even worst-case (0% cache, 83s scraping
overhead) totals 533s — within the 800s worker ceiling.

Co-Authored-By: Neuridion"
```

---

### Task 10: Final validation

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify all changes committed**

Run: `git status` and `git log --oneline -12`
Expected: Clean working tree, all task commits present
