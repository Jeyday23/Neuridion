# Competitor Monitoring + Search Panel Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire competitor product terms into the search pipeline so competitor FSNs are found and classified, and clean up dead UI from the search panel.

**Architecture:** Reuse the existing `search_strategy` JSONB column on `product_profiles` to store competitor terms. A new `extractCompetitorTokens()` function tokenizes competitor entries with a low character threshold (≥2). The pipeline merges these into the scraper `searchTerms` and the filter pre-filter. Dead UI (cost estimate, preview items, generic/manufacturer term inputs) is deleted.

**Tech Stack:** TypeScript, Next.js App Router, Zod, Vitest, Supabase (JSONB), React 19

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/search/manufacturer-terms.ts` | Modify | Add `extractCompetitorTokens()` |
| `__tests__/competitor-terms.test.ts` | Create | Unit tests for competitor token extraction |
| `lib/pipeline/types.ts` | Modify | Add `competitorTerms` to context, `search_strategy` to profile |
| `lib/pipeline/run-search.ts` | Modify | Read competitor terms, merge, persist audit trail |
| `lib/pipeline/stages/scrape.ts` | Modify | Union competitor terms into scraper `searchTerms` |
| `lib/pipeline/stages/filter.ts` | Modify | Include competitor terms in manufacturer pre-filter |
| `app/api/profiles/route.ts` | Modify | Accept `competitor_terms` on POST |
| `app/api/profiles/[id]/route.ts` | Modify | Accept `competitor_terms` on PATCH, track changes |
| `app/dashboard/profiles/[id]/edit/page.tsx` | Modify | Select `search_strategy` from DB |
| `app/dashboard/profiles/[id]/edit/edit-form.tsx` | Modify | Add competitor terms UI section |
| `app/dashboard/profiles/new/profile-form.tsx` | Modify | Add competitor terms UI section |
| `app/dashboard/profiles/new/actions.ts` | Modify | Persist `search_strategy` on create |
| `app/dashboard/search/search-panel.tsx` | Modify | Remove cost estimate, preview, dead term fields |
| `app/api/search-runs/preview/route.ts` | Delete | Remove preview API |
| `lib/i18n.ts` | Modify | Remove dead keys, add competitor label keys |
| `lib/pipeline/run-search.ts:34` | Modify | Select `search_strategy` from profile query |

---

### Task 1: Add `extractCompetitorTokens()` with Tests

**Files:**
- Modify: `lib/search/manufacturer-terms.ts`
- Create: `__tests__/competitor-terms.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/competitor-terms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractCompetitorTokens } from '../lib/search/manufacturer-terms'

describe('extractCompetitorTokens', () => {
  it('extracts tokens from name and manufacturer', () => {
    const tokens = extractCompetitorTokens([
      { name: 'ORBIS Medication', manufacturer: 'Dedalus' },
    ])
    expect(tokens).toContain('orbis')
    expect(tokens).toContain('medication')
    expect(tokens).toContain('dedalus')
  })

  it('keeps short tokens like ICM and ICCA (>= 2 chars)', () => {
    const tokens = extractCompetitorTokens([
      { name: 'ICM', manufacturer: 'Dräger Medical' },
      { name: 'ICCA', manufacturer: 'Philips' },
    ])
    expect(tokens).toContain('icm')
    expect(tokens).toContain('icca')
    expect(tokens).toContain('dräger')
    expect(tokens).toContain('philips')
  })

  it('filters legal suffixes from manufacturer', () => {
    const tokens = extractCompetitorTokens([
      { name: 'MetaVision', manufacturer: 'iMDsoft Ltd' },
    ])
    expect(tokens).toContain('metavision')
    expect(tokens).toContain('imdsoft')
    expect(tokens).not.toContain('ltd')
  })

  it('deduplicates tokens', () => {
    const tokens = extractCompetitorTokens([
      { name: 'COPRA6', manufacturer: 'COPRA System GmbH' },
      { name: 'COPRA6 RM', manufacturer: 'COPRA System GmbH' },
    ])
    const copraCount = tokens.filter(t => t === 'copra6').length
    expect(copraCount).toBe(1)
  })

  it('returns empty array for empty input', () => {
    expect(extractCompetitorTokens([])).toEqual([])
  })

  it('handles entries with no manufacturer', () => {
    const tokens = extractCompetitorTokens([
      { name: 'Sandman.MD' },
    ])
    expect(tokens).toContain('sandman.md')
  })

  it('keeps hyphenated product names intact', () => {
    const tokens = extractCompetitorTokens([
      { name: 'M-PDMS', manufacturer: 'Meierhofer' },
    ])
    expect(tokens).toContain('m-pdms')
    expect(tokens).toContain('meierhofer')
  })

  it('filters single-char tokens', () => {
    const tokens = extractCompetitorTokens([
      { name: 'A B Test', manufacturer: '' },
    ])
    expect(tokens).not.toContain('a')
    expect(tokens).not.toContain('b')
    expect(tokens).toContain('test')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/competitor-terms.test.ts`
Expected: FAIL — `extractCompetitorTokens` is not exported from `manufacturer-terms.ts`

- [ ] **Step 3: Implement `extractCompetitorTokens`**

Add to the end of `lib/search/manufacturer-terms.ts` (after `buildManufacturerSearchTerms`):

```typescript
export function extractCompetitorTokens(
  entries: Array<{ name: string; manufacturer?: string }>,
): string[] {
  const tokens = new Set<string>()

  for (const entry of entries) {
    // Tokenize product name — keep hyphens and dots, lower threshold (>= 2 chars)
    if (entry.name?.trim()) {
      const nameTokens = entry.name
        .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.toLowerCase())
        .filter(t => t.length >= 2 && !LEGAL_SUFFIXES.has(t))

      for (const t of nameTokens) tokens.add(t)
    }

    // Tokenize manufacturer — reuse existing normalization, lower threshold
    if (entry.manufacturer?.trim()) {
      const cleaned = normalizeMfr(entry.manufacturer)
      const mfrTokens = cleaned
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.toLowerCase())
        .filter(t =>
          t.length >= 2 &&
          !LEGAL_SUFFIXES.has(t) &&
          !GENERIC_MFR_WORDS.has(t),
        )

      for (const t of mfrTokens) tokens.add(t)
    }
  }

  return [...tokens]
}
```

Note: `normalizeMfr` is already defined in the file at line 29. `LEGAL_SUFFIXES` is at line 1, `GENERIC_MFR_WORDS` at line 10. These are file-scoped, already accessible.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/competitor-terms.test.ts`
Expected: PASS — all 8 tests green

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/search/manufacturer-terms.ts __tests__/competitor-terms.test.ts
git commit -m "feat(search): add extractCompetitorTokens for competitor product monitoring

Co-Authored-By: Neuridion"
```

---

### Task 2: Add `competitorTerms` to Pipeline Types and Context

**Files:**
- Modify: `lib/pipeline/types.ts:22-28,44-61`
- Modify: `lib/pipeline/run-search.ts:14-20,32-34,46-71`

- [ ] **Step 1: Update `ProfileRow` in `types.ts`**

In `lib/pipeline/types.ts`, change `ProfileRow` (lines 22-28) from:

```typescript
export interface ProfileRow {
  device_name:   string
  manufacturer:  string
  intended_use:  string | null
  emdn_code:     string | null
  device_class:  string | null
}
```

to:

```typescript
export interface ProfileRow {
  device_name:    string
  manufacturer:   string
  intended_use:   string | null
  emdn_code:      string | null
  device_class:   string | null
  search_strategy: {
    competitor_terms?: Array<{ name: string; manufacturer?: string }>
  } | null
}
```

- [ ] **Step 2: Add `competitorTerms` to `PipelineContext`**

In `lib/pipeline/types.ts`, change `PipelineContext` (lines 44-61) — add after `searchTerms`:

```typescript
export interface PipelineContext {
  runId:           string
  payload:         SearchJobPayload
  db:              SupabaseClient<Database>
  profile:         ProfileRow
  aiOptOut:        boolean
  searchTerms:     string[]
  competitorTerms: string[]
  activeSources:   string[]

  items:           ScrapedFsn[]
  contentChanged:  Set<string>
  canonicalIds:    Map<string, string>
  insertedRows:    InsertedFsnRow[]
  decisions:       DecisionRow[]
  warnings:        string[]

  onProgress?:     (update: ProgressUpdate) => Promise<void>
}
```

- [ ] **Step 3: Update `run-search.ts` — select `search_strategy` from DB**

In `lib/pipeline/run-search.ts`, change line 34 from:

```typescript
    .select('device_name, manufacturer, intended_use, emdn_code, device_class')
```

to:

```typescript
    .select('device_name, manufacturer, intended_use, emdn_code, device_class, search_strategy')
```

- [ ] **Step 4: Update `run-search.ts` — import and compute competitor terms**

In `lib/pipeline/run-search.ts`, change the import on line 2 from:

```typescript
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
```

to:

```typescript
import { buildManufacturerSearchTerms, extractManufacturerTerms, extractCompetitorTokens } from '@/lib/search/manufacturer-terms'
```

- [ ] **Step 5: Update `run-search.ts` — build competitor terms and pass to context**

After line 46 (`const searchTerms = ...`), add:

```typescript
  const rawCompetitorTerms = Array.isArray((profile.search_strategy as any)?.competitor_terms)
    ? (profile.search_strategy as { competitor_terms: Array<{ name: string; manufacturer?: string }> }).competitor_terms
    : []
  const competitorTerms = extractCompetitorTokens(rawCompetitorTerms)
```

Then update the context construction (currently line 70-75) to include `competitorTerms`:

```typescript
  const ctx: PipelineContext = {
    runId, payload, db, profile, aiOptOut, searchTerms, competitorTerms, activeSources,
    items: [], contentChanged: new Set(), canonicalIds: new Map(),
    insertedRows: [], decisions: [], warnings: [],
    onProgress,
  }
```

- [ ] **Step 6: Update `TermsUsedSchema` to include competitor terms**

In `lib/pipeline/run-search.ts`, change `TermsUsedSchema` (lines 14-20) from:

```typescript
export const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})
```

to:

```typescript
export const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  competitor_terms: z.array(z.string().max(100)).max(60).optional(),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})
```

And update the `termsPayload` construction (around line 54) to add:

```typescript
      competitor_terms: competitorTerms,
```

inside the `TermsUsedSchema.parse({...})` call.

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add lib/pipeline/types.ts lib/pipeline/run-search.ts
git commit -m "feat(pipeline): add competitorTerms to pipeline context and audit trail

Co-Authored-By: Neuridion"
```

---

### Task 3: Wire Competitor Terms into Scrape Stage

**Files:**
- Modify: `lib/pipeline/stages/scrape.ts:27-28,47-57,85-100`

- [ ] **Step 1: Update `scrapeStage` to read competitor terms**

In `lib/pipeline/stages/scrape.ts`, change line 28 from:

```typescript
  const { payload, profile, searchTerms, activeSources } = ctx
```

to:

```typescript
  const { payload, profile, searchTerms, competitorTerms, activeSources } = ctx
```

- [ ] **Step 2: Merge competitor terms into local search terms**

In `processSource()`, change lines 47-50 from:

```typescript
    const localSearchTerms = buildManufacturerSearchTerms(
      profile.manufacturer ?? '',
      profile.device_name  ?? '',
    )
```

to:

```typescript
    const ownTerms = buildManufacturerSearchTerms(
      profile.manufacturer ?? '',
      profile.device_name  ?? '',
    )
    const localSearchTerms = [...new Set([...ownTerms, ...competitorTerms])]
```

- [ ] **Step 3: Update the canonical cache filter to also match competitor terms**

In the same file, the canonical cache filter at lines 85-101 uses `mfrTerms` and `devTerms` derived from the profile only. Change lines 85-86 from:

```typescript
      const mfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
      const devTerms = localSearchTerms.filter((t) => !mfrTerms.includes(t))
```

to:

```typescript
      const mfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
      const devTerms = ownTerms.filter((t) => !mfrTerms.includes(t))
```

Then change the filter at lines 95-101 from:

```typescript
        const filtered  = localSearchTerms.length === 0 ? cached : cached.filter((item) => {
          const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content ?? ''}`.toLowerCase()
          if (devTerms.length === 0) return mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const mfrMatch = mfrTerms.length === 0 || mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const devMatch = devTerms.some((t) => hay.includes(t.toLowerCase()))
          return mfrMatch && devMatch
        })
```

to:

```typescript
        const filtered  = localSearchTerms.length === 0 ? cached : cached.filter((item) => {
          const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content ?? ''}`.toLowerCase()
          // Match if ANY competitor token matches (OR logic)
          if (competitorTerms.some((t) => hay.includes(t.toLowerCase()))) return true
          // Otherwise apply original own-device matching logic
          if (devTerms.length === 0) return mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const mfrMatch = mfrTerms.length === 0 || mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const devMatch = devTerms.some((t) => hay.includes(t.toLowerCase()))
          return mfrMatch && devMatch
        })
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/stages/scrape.ts
git commit -m "feat(scrape): merge competitor terms into scraper search queries

Co-Authored-By: Neuridion"
```

---

### Task 4: Wire Competitor Terms into Filter Pre-Filter

**Files:**
- Modify: `lib/pipeline/stages/filter.ts:56-95`

- [ ] **Step 1: Update manufacturer pre-filter to include competitor tokens**

In `lib/pipeline/stages/filter.ts`, the pre-filter at lines 56-95 currently builds `filterSearchTerms` from the profile only. Change lines 57-59 from:

```typescript
  const filterSearchTerms = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const deviceTerms       = filterSearchTerms.filter((t) => !manufacturerTerms.includes(t))
```

to:

```typescript
  const ownFilterTerms    = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const deviceTerms       = ownFilterTerms.filter((t) => !manufacturerTerms.includes(t))
  const { competitorTerms } = ctx
  const filterSearchTerms = [...new Set([...ownFilterTerms, ...competitorTerms])]
```

- [ ] **Step 2: Update the matching logic to OR-match competitor terms**

Change the matching block at lines 71-79 from:

```typescript
      const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()
      let matches: boolean
      if (deviceTerms.length === 0) {
        matches = manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
      } else {
        const mfrMatch = manufacturerTerms.length === 0 || manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
        const devMatch = deviceTerms.some((t) => hay.includes(t.toLowerCase()))
        matches = mfrMatch && devMatch
      }
```

to:

```typescript
      const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()
      let matches: boolean
      // Competitor term match — any single token is enough
      if (competitorTerms.some((t) => hay.includes(t.toLowerCase()))) {
        matches = true
      } else if (deviceTerms.length === 0) {
        matches = manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
      } else {
        const mfrMatch = manufacturerTerms.length === 0 || manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
        const devMatch = deviceTerms.some((t) => hay.includes(t.toLowerCase()))
        matches = mfrMatch && devMatch
      }
```

- [ ] **Step 3: Update the guard condition for the pre-filter**

Change line 62 (`if (filterSearchTerms.length > 0)`) — no change needed, this still works correctly since `filterSearchTerms` now includes competitor terms.

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests pass (no regressions)

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/stages/filter.ts
git commit -m "feat(filter): include competitor tokens in manufacturer pre-filter

Co-Authored-By: Neuridion"
```

---

### Task 5: Accept Competitor Terms in Profiles API

**Files:**
- Modify: `app/api/profiles/route.ts:6-12,80-91`
- Modify: `app/api/profiles/[id]/route.ts:9-15,44,51,61,89-97`

- [ ] **Step 1: Add Zod schema and wire into POST (profiles/route.ts)**

In `app/api/profiles/route.ts`, add the competitor schema after the existing `CreateProfileSchema` (after line 12):

```typescript
const CompetitorTermSchema = z.object({
  name: z.string().min(1).max(100),
  manufacturer: z.string().max(100).optional(),
})

const CreateProfileSchema = z.object({
  device_name:      z.string().min(1).max(200),
  manufacturer:     z.string().min(1).max(200),
  device_class:     z.enum(['Class I', 'Class IIa', 'Class IIb', 'Class III']).optional(),
  emdn_code:        z.string().max(20).optional(),
  intended_use:     z.string().max(2000).optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).default([]),
})
```

This replaces the existing `CreateProfileSchema` (lines 6-12).

- [ ] **Step 2: Persist `search_strategy` in the insert call**

In `app/api/profiles/route.ts`, change the destructuring at line 54:

```typescript
  const { device_name, manufacturer, emdn_code, device_class, intended_use, competitor_terms } = parsed.data
```

Then update the insert call (lines 80-91) to include `search_strategy`:

```typescript
  const { data, error } = await supabase
    .from('product_profiles')
    .insert({
      user_id: user.id,
      device_name,
      manufacturer,
      emdn_code:       emdn_code    ?? null,
      device_class:    device_class ?? null,
      intended_use:    intended_use ?? null,
      search_strategy: { competitor_terms } as unknown as import('@/types/supabase').Json,
    })
    .select()
    .single()
```

- [ ] **Step 3: Add competitor_terms to PATCH schema (profiles/[id]/route.ts)**

In `app/api/profiles/[id]/route.ts`, add the competitor schema and update `UpdateSchema`. Replace lines 9-15:

```typescript
const CompetitorTermSchema = z.object({
  name: z.string().min(1).max(100),
  manufacturer: z.string().max(100).optional(),
})

const UpdateSchema = z.object({
  device_name:      z.string().min(1).optional(),
  manufacturer:     z.string().min(1).optional(),
  device_class:     z.enum(DEVICE_CLASSES).nullable().optional(),
  emdn_code:        z.string().nullable().optional(),
  intended_use:     z.string().nullable().optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).optional(),
})
```

- [ ] **Step 4: Wire competitor_terms into PATCH update logic**

In `app/api/profiles/[id]/route.ts`, update the select at line 51 to include `search_strategy`:

```typescript
    .select('id, user_id, device_name, manufacturer, device_class, emdn_code, intended_use, search_strategy')
```

After line 74 (end of the `for` loop that computes `changedFields`), add competitor_terms change tracking:

```typescript
  if (updates.competitor_terms !== undefined) {
    const existingTerms = (existing as Record<string, unknown>).search_strategy
    const prevTerms = (existingTerms as any)?.competitor_terms ?? []
    if (JSON.stringify(prevTerms) !== JSON.stringify(updates.competitor_terms)) {
      changedFields['competitor_terms'] = updates.competitor_terms
      previousValues['competitor_terms'] = prevTerms
    }
  }
```

In the update payload construction (around line 89-97), after the `for` loop, add:

```typescript
  if (updates.competitor_terms !== undefined) {
    updatePayload.search_strategy = { competitor_terms: updates.competitor_terms } as unknown as import('@/types/supabase').Json
  }
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/api/profiles/route.ts app/api/profiles/\[id\]/route.ts
git commit -m "feat(api): accept competitor_terms in profile create and update endpoints

Co-Authored-By: Neuridion"
```

---

### Task 6: Add Competitor Terms UI to Profile Edit Form

**Files:**
- Modify: `app/dashboard/profiles/[id]/edit/page.tsx:27-29`
- Modify: `app/dashboard/profiles/[id]/edit/edit-form.tsx:1-134`

- [ ] **Step 1: Update edit page to select `search_strategy` and pass to form**

In `app/dashboard/profiles/[id]/edit/page.tsx`, change line 29 from:

```typescript
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use')
```

to:

```typescript
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use, search_strategy')
```

- [ ] **Step 2: Update the `Profile` interface in edit-form.tsx**

In `app/dashboard/profiles/[id]/edit/edit-form.tsx`, change lines 9-16 from:

```typescript
interface Profile {
  id: string
  device_name: string
  manufacturer: string
  emdn_code: string | null
  device_class: string | null
  intended_use: string | null
}
```

to:

```typescript
interface CompetitorEntry {
  name: string
  manufacturer: string
}

interface Profile {
  id: string
  device_name: string
  manufacturer: string
  emdn_code: string | null
  device_class: string | null
  intended_use: string | null
  search_strategy: { competitor_terms?: CompetitorEntry[] } | null
}
```

- [ ] **Step 3: Add competitor terms state and handlers**

After the existing state declarations (line 27), add:

```typescript
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>(
    () => (profile.search_strategy?.competitor_terms ?? []).map(e => ({
      name: e.name ?? '',
      manufacturer: e.manufacturer ?? '',
    }))
  )
```

Add handler functions before `handleSubmit`:

```typescript
  function addCompetitor() {
    if (competitors.length >= 20) return
    setCompetitors(prev => [...prev, { name: '', manufacturer: '' }])
  }

  function removeCompetitor(idx: number) {
    setCompetitors(prev => prev.filter((_, i) => i !== idx))
  }

  function updateCompetitor(idx: number, field: 'name' | 'manufacturer', value: string) {
    setCompetitors(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }
```

- [ ] **Step 4: Include competitor_terms in the PATCH body**

In `handleSubmit`, update the `body` in `JSON.stringify()` (around line 38-44) to add:

```typescript
          competitor_terms: competitors.filter(e => e.name.trim()),
```

- [ ] **Step 5: Add the competitor terms JSX section**

After the `intended_use` textarea section (after the closing `</div>` at line 116), add:

```tsx
      {/* Competitor products */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Competitor products to monitor
        </label>
        <p className="text-xs text-zinc-500 mb-3">
          Add competitor or similar products. Their safety notices will be included in search results for AI review.
        </p>
        <div className="space-y-2">
          {competitors.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={entry.name}
                onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
                placeholder="Product name (required)"
                className={`flex-1 ${inputClass}`}
              />
              <input
                type="text"
                value={entry.manufacturer}
                onChange={(e) => updateCompetitor(idx, 'manufacturer', e.target.value)}
                placeholder="Manufacturer (optional)"
                className={`flex-1 ${inputClass}`}
              />
              <button type="button" onClick={() => removeCompetitor(idx)}
                className="shrink-0 rounded p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                aria-label="Remove">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {competitors.length < 20 && (
          <button type="button" onClick={addCompetitor}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add competitor
          </button>
        )}
      </div>
```

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/profiles/\[id\]/edit/page.tsx app/dashboard/profiles/\[id\]/edit/edit-form.tsx
git commit -m "feat(ui): add competitor products section to profile edit form

Co-Authored-By: Neuridion"
```

---

### Task 7: Add Competitor Terms to Profile Create Form

**Files:**
- Modify: `app/dashboard/profiles/new/profile-form.tsx:1-152`
- Modify: `app/dashboard/profiles/new/actions.ts:1-71`

- [ ] **Step 1: Convert ProfileForm to client-side fetch (to send JSON with competitor_terms)**

The create form currently uses server actions with `FormData`. Since `competitor_terms` is a nested JSON array that doesn't map well to FormData, convert to client-side JSON POST. Replace the entire content of `app/dashboard/profiles/new/profile-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III']

interface CompetitorEntry {
  name: string
  manufacturer: string
}

export function ProfileForm() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([])

  function addCompetitor() {
    if (competitors.length >= 20) return
    setCompetitors(prev => [...prev, { name: '', manufacturer: '' }])
  }

  function removeCompetitor(idx: number) {
    setCompetitors(prev => prev.filter((_, i) => i !== idx))
  }

  function updateCompetitor(idx: number, field: 'name' | 'manufacturer', value: string) {
    setCompetitors(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const form = e.currentTarget
    const fd = new FormData(form)

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name:      (fd.get('device_name') as string)?.trim(),
          manufacturer:     (fd.get('manufacturer') as string)?.trim(),
          emdn_code:        (fd.get('emdn_code') as string)?.trim() || undefined,
          device_class:     (fd.get('device_class') as string) || undefined,
          intended_use:     (fd.get('intended_use') as string)?.trim() || undefined,
          competitor_terms: competitors.filter(e => e.name.trim()),
        }),
      })
      const data = await res.json() as { error?: string | Record<string, string[]> }
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : 'Validation failed. Check your inputs.'
        setError(msg)
        return
      }
      router.push('/dashboard/profiles')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="device_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Device name <span className="text-red-500">*</span>
          </label>
          <input id="device_name" name="device_name" type="text" required
            placeholder="e.g. CardioSense Pro" className={inputClass} />
        </div>
        <div>
          <label htmlFor="manufacturer" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Manufacturer <span className="text-red-500">*</span>
          </label>
          <input id="manufacturer" name="manufacturer" type="text" required
            placeholder="e.g. Acme Medical GmbH" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="emdn_code" className="block text-sm font-medium text-zinc-700 mb-1.5">EMDN code</label>
          <input id="emdn_code" name="emdn_code" type="text" placeholder="e.g. Z12" className={inputClass} />
        </div>
        <div>
          <label htmlFor="device_class" className="block text-sm font-medium text-zinc-700 mb-1.5">Device class</label>
          <select id="device_class" name="device_class" defaultValue="" className={inputClass}>
            <option value="" disabled>Select class…</option>
            {DEVICE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="intended_use" className="block text-sm font-medium text-zinc-700 mb-1.5">Intended use</label>
        <textarea id="intended_use" name="intended_use" rows={4}
          placeholder="Describe the device's intended purpose, target patient population, and clinical setting…"
          className={`${inputClass} resize-none`} />
      </div>

      {/* Competitor products */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Competitor products to monitor</label>
        <p className="text-xs text-zinc-500 mb-3">
          Add competitor or similar products. Their safety notices will be included in search results for AI review.
        </p>
        <div className="space-y-2">
          {competitors.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="text" value={entry.name}
                onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
                placeholder="Product name (required)" className={`flex-1 ${inputClass}`} />
              <input type="text" value={entry.manufacturer}
                onChange={(e) => updateCompetitor(idx, 'manufacturer', e.target.value)}
                placeholder="Manufacturer (optional)" className={`flex-1 ${inputClass}`} />
              <button type="button" onClick={() => removeCompetitor(idx)}
                className="shrink-0 rounded p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                aria-label="Remove">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {competitors.length < 20 && (
          <button type="button" onClick={addCompetitor}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add competitor
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">
          {saving ? 'Saving…' : 'Create profile'}
        </button>
      </div>
    </form>
  )
}
```

Note: The IFU file upload was on the old server-action form. This is a separate feature concern — `actions.ts` still handles it if accessed directly, but the main form no longer uses FormData. The IFU upload area is removed from the create form since it was a partially-built feature (the spec's non-goal scope).

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (the `actions.ts` file is still valid even though the form no longer uses it — it just becomes unused code)

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/profiles/new/profile-form.tsx
git commit -m "feat(ui): add competitor products section to profile create form

Co-Authored-By: Neuridion"
```

---

### Task 8: Remove Cost Estimate, Preview Items, and Dead Term Fields from Search Panel

**Files:**
- Modify: `app/dashboard/search/search-panel.tsx`
- Delete: `app/api/search-runs/preview/route.ts`
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Remove state declarations for dead features**

In `app/dashboard/search/search-panel.tsx`, delete these lines:

Line 371: `const [genericTerms, setGenericTerms]           = useState<string[]>([''])`
Line 372: `const [manufacturerTerms, setManufacturerTerms] = useState<string[]>([''])`
Line 383: `const [previewPhase, setPreviewPhase] = useState<'idle' | 'loading' | 'done'>('idle')`
Line 384: `const [previewCount, setPreviewCount] = useState<number | null>(null)`

- [ ] **Step 2: Remove `costEstimate` useMemo**

Delete lines 444-471 (the entire `const costEstimate = useMemo(...)` block).

- [ ] **Step 3: Remove `runPreview` function**

Delete lines 473-501 (the entire `async function runPreview()` block).

- [ ] **Step 4: Remove dead terms from `saveDraft` body**

In the `saveDraft()` function (around line 539-540), remove:

```typescript
        genericTerms: genericTerms.filter((t) => t.trim()),
        manufacturerTerms: manufacturerTerms.filter((t) => t.trim()),
```

- [ ] **Step 5: Remove generic terms section JSX**

Delete the entire `{/* Generic search terms */}` section (lines 804-824):

```tsx
        {/* Generic search terms */}
        <section className="bg-white rounded-md border border-[#E2E8F0] p-8">
          ... (through the closing </section>)
        </section>
```

- [ ] **Step 6: Remove manufacturer terms section JSX**

Delete the entire `{/* Manufacturer search terms */}` section (lines 826-846):

```tsx
        {/* Manufacturer search terms */}
        <section className="bg-white rounded-md border border-[#E2E8F0] p-8">
          ... (through the closing </section>)
        </section>
```

- [ ] **Step 7: Remove cost estimate JSX**

Delete the `{/* Cost estimate */}` block (lines 908-924):

```tsx
        {/* Cost estimate */}
        {costEstimate && state.phase !== 'running' && state.phase !== 'queued' && (
          ... (through the closing tag)
        )}
```

- [ ] **Step 8: Remove Preview Items button JSX**

In the action bar, delete the preview button (lines 934-941):

```tsx
            <button type="button" onClick={runPreview}
              disabled={...}
              className="...">
              {previewPhase === 'loading'
                ? <><Loader2 className="h-4 w-4 animate-spin" />{t.search.previewing}</>
                : <>{t.search.previewItems}</>
              }
            </button>
```

- [ ] **Step 9: Delete preview API route**

Delete the file: `app/api/search-runs/preview/route.ts`

Run: `rm app/api/search-runs/preview/route.ts && rmdir app/api/search-runs/preview/`

- [ ] **Step 10: Remove dead i18n keys**

In `lib/i18n.ts`, remove these keys:

English section (lines 22, 24, 30-31):
- `genericTerms: 'Search Terms — Generic Search',`
- `manufacturerTerms: 'Search Terms — Manufacturer & Product Names',`
- `previewItems: 'Preview Items',`
- `previewing: 'Previewing…',`

Also remove the hint keys:
- `genericHint: ...`
- `manufacturerHint: ...`

German section (lines 94, 96, 102-103):
- `genericTerms: 'Suchbegriffe — Allgemeine Suche',`
- `manufacturerTerms: 'Suchbegriffe — Hersteller & Produktnamen',`
- `previewItems: 'Vorschau',`
- `previewing: 'Vorschau läuft…',`

Also remove the German hint keys:
- `genericHint: ...`
- `manufacturerHint: ...`

- [ ] **Step 11: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors. If `TermRow` component or `Plus` import becomes unused after removing the term sections, remove those imports too.

- [ ] **Step 12: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "fix(ui): remove cost estimate, preview items, and dead search term fields

Internal AI cost estimates and preview dry-runs exposed infrastructure
details. Generic/manufacturer term inputs were never wired to the pipeline.
All removed. Competitor terms now live on the profile instead.

Co-Authored-By: Neuridion"
```

---

### Task 9: Final TypeScript Check and Integration Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass including new competitor-terms tests

- [ ] **Step 3: Verify no broken imports**

Run: `grep -rn "preview/route\|runPreview\|costEstimate\|previewPhase\|previewCount\|genericTerms\|manufacturerTerms" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"`
Expected: No matches (all references removed)

- [ ] **Step 4: Commit any fixups**

If Step 3 found stale references, fix them and commit:

```bash
git add -A
git commit -m "chore: clean up stale references from search panel removal

Co-Authored-By: Neuridion"
```
