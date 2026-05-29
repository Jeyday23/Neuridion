# Robert Feedback Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 issues Robert reported — 45-minute search hangs, missing profile-attached strategy docs, confusing navigation, and no profile preview on the search page.

**Architecture:** Three workstreams executed in impact order. Performance fixes (B1 competitor token tightening, B2 per-scraper timeouts) ship first to fix the critical 45-minute hang. UX fixes (C1 admin rename, C2 profile preview) ship next. Architecture fixes (A1-A3 profile strategy docs, timing instrumentation) ship last.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase PostgreSQL, Vitest

---

### Task 1: Tighten competitor token extraction (B1 — HOTFIX)

**Files:**
- Modify: `lib/search/manufacturer-terms.ts:84-122`
- Test: `__tests__/manufacturer-terms.test.ts`

This is the root cause of 45-minute searches. `extractCompetitorTokens` uses `t.length >= 2` with no generic word filtering, generating 30-50 broad tokens from 15 competitors. Tokens like "pro", "med", "bio" match thousands of unrelated FSNs.

- [ ] **Step 1: Write failing tests for tightened competitor extraction**

Add these test cases to `__tests__/manufacturer-terms.test.ts`:

```typescript
import { extractCompetitorTokens } from '../lib/search/manufacturer-terms'

describe('extractCompetitorTokens', () => {
  it('filters tokens shorter than 3 chars (except SHORT_BUT_DISTINCTIVE)', () => {
    const result = extractCompetitorTokens([{ name: 'AB Pro Device' }])
    expect(result).not.toContain('ab')
    expect(result).not.toContain('pro')
  })

  it('filters GENERIC_DEVICE_WORDS from competitor names', () => {
    const result = extractCompetitorTokens([{ name: 'CardioSense Pro Medical System' }])
    expect(result).not.toContain('pro')
    expect(result).not.toContain('medical')
    expect(result).not.toContain('system')
    expect(result).toContain('cardiosense')
  })

  it('filters GENERIC_MFR_WORDS from competitor manufacturer field', () => {
    const result = extractCompetitorTokens([{ name: 'Widget', manufacturer: 'Global Healthcare Solutions GmbH' }])
    expect(result).not.toContain('global')
    expect(result).not.toContain('healthcare')
    expect(result).not.toContain('solutions')
    expect(result).toContain('widget')
  })

  it('caps at 3 tokens per competitor name entry', () => {
    const result = extractCompetitorTokens([
      { name: 'Alpha Beta Gamma Delta Epsilon Zeta' },
    ])
    const nameTokens = result.filter(t => ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].includes(t))
    expect(nameTokens.length).toBeLessThanOrEqual(3)
  })

  it('caps at 3 tokens per competitor manufacturer entry', () => {
    const result = extractCompetitorTokens([
      { name: 'Widget', manufacturer: 'Alpha Beta Gamma Delta Epsilon' },
    ])
    const mfrTokens = result.filter(t => ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].includes(t))
    expect(mfrTokens.length).toBeLessThanOrEqual(3)
  })

  it('caps total tokens at 20', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      name: `LongProductName${i} ExtraWord${i} AnotherWord${i} FourthWord${i}`,
      manufacturer: `Manufacturer${i} Division${i} Branch${i}`,
    }))
    const result = extractCompetitorTokens(entries)
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('keeps SHORT_BUT_DISTINCTIVE 2-char tokens', () => {
    const result = extractCompetitorTokens([{ name: '3M Steri-Strip' }])
    expect(result).toContain('3m')
  })

  it('returns empty array for empty input', () => {
    expect(extractCompetitorTokens([])).toEqual([])
  })

  it('skips entries with blank names', () => {
    const result = extractCompetitorTokens([{ name: '', manufacturer: 'Acme' }])
    expect(result).not.toContain('')
    expect(result).toContain('acme')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/manufacturer-terms.test.ts`
Expected: Multiple FAIL results for the new `extractCompetitorTokens` tests (tokens "pro", "medical", "system" are not filtered; no cap enforced).

- [ ] **Step 3: Implement the fix in extractCompetitorTokens**

Replace `extractCompetitorTokens` in `lib/search/manufacturer-terms.ts:84-122` with:

```typescript
const MAX_TOKENS_PER_ENTRY = 3
const MAX_TOTAL_COMPETITOR_TOKENS = 20

export function extractCompetitorTokens(
  entries: Array<{ name: string; manufacturer?: string }>,
): string[] {
  const tokens = new Set<string>()

  for (const entry of entries) {
    if (entry.name?.trim()) {
      const nameTokens = entry.name
        .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.toLowerCase())
        .filter(t =>
          (t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t)) &&
          !LEGAL_SUFFIXES.has(t) &&
          !GENERIC_MFR_WORDS.has(t) &&
          !GENERIC_DEVICE_WORDS.has(t),
        )

      let added = 0
      for (const t of nameTokens) {
        if (added >= MAX_TOKENS_PER_ENTRY) break
        if (!tokens.has(t)) { tokens.add(t); added++ }
      }
    }

    if (entry.manufacturer?.trim()) {
      const mfrTokens = entry.manufacturer
        .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.toLowerCase())
        .filter(t =>
          (t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t)) &&
          !LEGAL_SUFFIXES.has(t) &&
          !GENERIC_MFR_WORDS.has(t),
        )

      let added = 0
      for (const t of mfrTokens) {
        if (added >= MAX_TOKENS_PER_ENTRY) break
        if (!tokens.has(t)) { tokens.add(t); added++ }
      }
    }
  }

  const result = [...tokens]
  return result.slice(0, MAX_TOTAL_COMPETITOR_TOKENS)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/manufacturer-terms.test.ts`
Expected: ALL tests pass including both existing and new tests.

- [ ] **Step 5: Update TermsUsedSchema cap in run-search.ts**

In `lib/pipeline/run-search.ts:17`, change `.max(60)` to `.max(20)`:

```typescript
  competitor_terms: z.array(z.string().max(100)).max(20).optional(),
```

- [ ] **Step 6: Commit**

```bash
git add lib/search/manufacturer-terms.ts __tests__/manufacturer-terms.test.ts lib/pipeline/run-search.ts
git commit -m "perf(search): tighten competitor token extraction — cap 3/entry, 20 total, filter generic words

Fixes 45-min search hangs reported by Robert. extractCompetitorTokens now applies
the same GENERIC_DEVICE_WORDS + GENERIC_MFR_WORDS filters as manufacturer terms,
raises min token length to 3, and caps at 3 tokens per entry / 20 total.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 2: Add per-scraper timeouts (B2)

**Files:**
- Modify: `lib/pipeline/stages/scrape.ts:38-141`

A single slow scraper (especially BfArM HTML pagination over 2 months) blocks the entire pipeline. Add `Promise.race` timeout per source so the pipeline never hangs.

- [ ] **Step 1: Add timeout constants and helper at top of scrape.ts**

Add after line 8 (`import type { PipelineContext, ProgressUpdate } from '../types'`):

```typescript
const SOURCE_TIMEOUTS_MS: Record<string, number> = {
  bfarm:      180_000,
  fda:        90_000,
  mhra:       90_000,
  swissmedic: 60_000,
}

const DEFAULT_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ])
}
```

- [ ] **Step 2: Wrap processSource call with timeout in Promise.allSettled**

Replace lines 143-145 in `scrape.ts`:

```typescript
  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => processSource(id, idx)),
  )
```

With:

```typescript
  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => {
      const timeoutMs = SOURCE_TIMEOUTS_MS[id] ?? DEFAULT_TIMEOUT_MS
      return withTimeout(processSource(id, idx), timeoutMs, id.toUpperCase())
    }),
  )
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run existing test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/stages/scrape.ts
git commit -m "perf(search): add per-scraper timeouts — BfArM 180s, FDA 90s, MHRA 90s, Swissmedic 60s

Prevents indefinite hangs when a single scraper is slow. Timed-out scrapers
are reported as rejected in Promise.allSettled and treated as degraded sources.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 3: Rename Admin to Administration (C1)

**Files:**
- Modify: `app/dashboard/sidebar-nav.tsx:68`

5-minute UX fix. Robert couldn't find the admin panel because the label was too subtle.

- [ ] **Step 1: Change the Admin label**

In `app/dashboard/sidebar-nav.tsx:68`, replace:

```tsx
              <span>Admin</span>
```

With:

```tsx
              <span>Administration</span>
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/sidebar-nav.tsx
git commit -m "ux(nav): rename Admin to Administration for clarity

Robert couldn't find the admin panel — the short 'Admin' label was too subtle
below the quota bar.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 4: Profile preview card on Search page (C2)

**Files:**
- Modify: `app/dashboard/search/page.tsx:1-14`
- Modify: `app/dashboard/search/search-panel.tsx:18-23, 350, 700-718`

When a profile is selected, show its details (intended use, device class, EMDN, competitor count, strategy docs) before the user runs a search.

- [ ] **Step 1: Expand the Profile interface and server-side select**

In `app/dashboard/search/page.tsx`, change the select to fetch full profile details:

```tsx
import { createClient } from '@/lib/supabase/server'
import { SearchPanel } from './search-panel'

export const metadata = { title: 'Search — Neuridion' }

export default async function SearchPage() {
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('product_profiles')
    .select('id, device_name, manufacturer, intended_use, emdn_code, device_class, search_strategy')
    .order('created_at', { ascending: false })

  return <SearchPanel profiles={profiles ?? []} />
}
```

- [ ] **Step 2: Update the Profile interface in search-panel.tsx**

Replace the `Profile` interface (lines 19-23):

```typescript
interface Profile {
  id: string
  device_name: string
  manufacturer: string
  intended_use: string | null
  emdn_code: string | null
  device_class: string | null
  search_strategy: {
    competitor_terms?: Array<{ name: string; manufacturer?: string }>
    strategy_doc_paths?: string[]
  } | null
}
```

- [ ] **Step 3: Add the ProfilePreviewCard component**

Add this component above the `SearchPanel` function (before line 350):

```tsx
function ProfilePreviewCard({ profile }: { profile: Profile }) {
  const competitorCount = profile.search_strategy?.competitor_terms?.filter(c => c.name?.trim()).length ?? 0
  const docCount = profile.search_strategy?.strategy_doc_paths?.length ?? 0

  return (
    <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#0F1F3D] truncate">
            {profile.device_name} — {profile.manufacturer}
          </h3>
          <div className="mt-2 space-y-1">
            {profile.intended_use && (
              <p className="text-xs text-[#134E4A] line-clamp-2">{profile.intended_use}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#0F766E]">
              {profile.device_class && <span>{profile.device_class}</span>}
              {profile.emdn_code && <span>EMDN: {profile.emdn_code}</span>}
              {competitorCount > 0 && (
                <span>{competitorCount} competitor{competitorCount !== 1 ? 's' : ''} monitored</span>
              )}
              {docCount > 0 && (
                <span>{docCount} strategy doc{docCount !== 1 ? 's' : ''} attached</span>
              )}
            </div>
          </div>
        </div>
        <a
          href={`/dashboard/profiles/${profile.id}/edit`}
          className="shrink-0 text-xs font-medium text-[#0D9488] hover:underline"
        >
          Edit →
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Render the preview card below the profile dropdown**

In the profile selector section (after the `</select>` closing tag around line 717), add:

```tsx
            {(() => {
              const selected = profiles.find(p => p.id === profileId)
              return selected ? <ProfilePreviewCard profile={selected} /> : null
            })()}
```

The full section becomes:

```tsx
          ) : (
            <>
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}
                className="w-full max-w-md rounded border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#134E4A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent">
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.device_name} — {p.manufacturer}</option>
                ))}
              </select>
              {(() => {
                const selected = profiles.find(p => p.id === profileId)
                return selected ? <ProfilePreviewCard profile={selected} /> : null
              })()}
            </>
          )}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/search/page.tsx app/dashboard/search/search-panel.tsx
git commit -m "ux(search): add profile preview card showing device details before running search

Shows intended use, device class, EMDN code, competitor count, and strategy doc
count when a profile is selected. Links to edit page. Addresses Robert's P3.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 5: Move file upload from Search page to Profile forms (A2)

**Files:**
- Modify: `app/dashboard/profiles/new/profile-form.tsx`
- Modify: `app/dashboard/profiles/[id]/edit/edit-form.tsx`
- Modify: `app/dashboard/search/search-panel.tsx:784-818`
- Modify: `app/api/profiles/route.ts:18-25, 104-114`
- Modify: `app/api/profiles/[id]/route.ts:20-27, 114-116`

Strategy documents should attach to profiles, not to search runs. Move the upload UI to both profile forms. Update API to persist `strategy_doc_paths` in the JSONB column.

- [ ] **Step 1: Add strategy_doc_paths to CreateProfileSchema**

In `app/api/profiles/route.ts`, update the schema (after line 25):

```typescript
const CreateProfileSchema = z.object({
  device_name:      z.string().min(1).max(200),
  manufacturer:     z.string().min(1).max(200),
  device_class:     z.enum(['Class I', 'Class IIa', 'Class IIb', 'Class III']).optional(),
  emdn_code:        z.string().max(20).transform(v => v ? v.toUpperCase() : v).pipe(z.string().regex(/^[A-Z]\d{2,8}$/, 'Invalid EMDN code format')).optional().or(z.literal('')).transform(v => v || null),
  intended_use:     z.string().max(2000).optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).default([]),
  strategy_doc_paths: z.array(z.string().max(500)).max(5).default([]),
})
```

- [ ] **Step 2: Persist strategy_doc_paths in the insert**

In `app/api/profiles/route.ts`, update the insert payload (line 113):

```typescript
      search_strategy: { competitor_terms, strategy_doc_paths } as unknown as Json,
```

And destructure from parsed.data (line 78):

```typescript
  const { device_name, manufacturer, emdn_code, device_class, intended_use, competitor_terms, strategy_doc_paths } = parsed.data
```

- [ ] **Step 3: Add strategy_doc_paths to UpdateSchema**

In `app/api/profiles/[id]/route.ts`, update the schema (after line 26):

```typescript
const UpdateSchema = z.object({
  device_name:      z.string().min(1).optional(),
  manufacturer:     z.string().min(1).optional(),
  device_class:     z.enum(DEVICE_CLASSES).nullable().optional(),
  emdn_code:        z.string().max(20).transform(v => v ? v.toUpperCase() : v).pipe(z.string().regex(/^[A-Z]\d{2,8}$/, 'Invalid EMDN code format')).nullable().optional().or(z.literal('')).transform(v => v || null),
  intended_use:     z.string().nullable().optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).optional(),
  strategy_doc_paths: z.array(z.string().max(500)).max(5).optional(),
})
```

- [ ] **Step 4: Persist strategy_doc_paths in the PATCH handler**

In `app/api/profiles/[id]/route.ts`, update the search_strategy construction. Replace lines 114-116:

```typescript
  if (updates.competitor_terms !== undefined || updates.strategy_doc_paths !== undefined) {
    const prevStrategy = (existing.search_strategy ?? {}) as Record<string, unknown>
    const newStrategy: Record<string, unknown> = { ...prevStrategy }
    if (updates.competitor_terms !== undefined) newStrategy.competitor_terms = updates.competitor_terms
    if (updates.strategy_doc_paths !== undefined) newStrategy.strategy_doc_paths = updates.strategy_doc_paths
    updatePayload.search_strategy = newStrategy as unknown as Json
  }
```

Also update the change tracking section (lines 92-99). After the existing `competitor_terms` block, add:

```typescript
  if (updates.strategy_doc_paths !== undefined) {
    const prevStrategy = (existing as Record<string, unknown>).search_strategy
    const prev = (prevStrategy as Record<string, unknown> | null)?.strategy_doc_paths ?? []
    if (JSON.stringify(prev) !== JSON.stringify(updates.strategy_doc_paths)) {
      changedFields['strategy_doc_paths'] = updates.strategy_doc_paths
      previousValues['strategy_doc_paths'] = prev
    }
  }
```

- [ ] **Step 5: Add file upload UI to profile-form.tsx (create)**

In `app/dashboard/profiles/new/profile-form.tsx`, add state and upload handler. Add imports at top:

```typescript
import { useState, useRef } from 'react'
import { Upload, X, CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
```

Add state inside `ProfileForm()` after existing state:

```typescript
  const [strategyFiles, setStrategyFiles] = useState<Array<{ key: string; name: string; path: string; status: 'uploading' | 'done' | 'error' }>>([])
  const strategyInputRef = useRef<HTMLInputElement>(null)
```

Add upload handler after `updateCompetitor`:

```typescript
  async function handleStrategyUpload(files: FileList | File[]) {
    const sb = createClient()
    const { data: { user: authUser } } = await sb.auth.getUser()
    if (!authUser) return

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue
      if (strategyFiles.length >= 5) break
      const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${authUser.id}/profiles/pending/${key}_${safe}`
      setStrategyFiles(prev => [...prev, { key, name: file.name, path, status: 'uploading' }])
      try {
        const { error } = await sb.storage.from('search-attachments').upload(path, file)
        setStrategyFiles(prev => prev.map(f => f.key === key ? { ...f, status: error ? 'error' : 'done' } : f))
      } catch {
        setStrategyFiles(prev => prev.map(f => f.key === key ? { ...f, status: 'error' } : f))
      }
    }
  }
```

Update the `handleSubmit` body to include strategy_doc_paths:

```typescript
        body: JSON.stringify({
          device_name:      (fd.get('device_name') as string)?.trim(),
          manufacturer:     (fd.get('manufacturer') as string)?.trim(),
          emdn_code:        (fd.get('emdn_code') as string)?.trim() || undefined,
          device_class:     (fd.get('device_class') as string) || undefined,
          intended_use:     (fd.get('intended_use') as string)?.trim() || undefined,
          competitor_terms: competitors.filter(e => e.name.trim()),
          strategy_doc_paths: strategyFiles.filter(f => f.status === 'done').map(f => f.path),
        }),
```

Add the upload section in the form JSX, between the competitors section and the error display:

```tsx
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Search strategy documents
          <InfoTooltip text="Upload your search strategy or PMS plan documents for reference. These files are stored with your profile for traceability but are not read by the AI during classification." />
        </label>
        <input ref={strategyInputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.txt" className="hidden"
          onChange={(e) => e.target.files && handleStrategyUpload(e.target.files)} />
        <button type="button" onClick={() => strategyInputRef.current?.click()}
          disabled={strategyFiles.length >= 5}
          className="w-full rounded border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" />
          Upload strategy document ({strategyFiles.length}/5)
        </button>
        {strategyFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {strategyFiles.map(f => (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                {f.status === 'uploading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />}
                {f.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                {f.status === 'error' && <X className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <span className="flex-1 truncate text-zinc-600">{f.name}</span>
                {f.status !== 'uploading' && (
                  <button type="button" onClick={() => setStrategyFiles(prev => prev.filter(u => u.key !== f.key))}
                    className="text-zinc-400 hover:text-red-500 transition-colors" aria-label="Remove file">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-zinc-400">
          If your uploaded strategy document already contains competitor information, you don't need to re-enter it in the competitor list above.
        </p>
      </div>
```

- [ ] **Step 6: Add file upload UI to edit-form.tsx (edit)**

Mirror the same pattern in `app/dashboard/profiles/[id]/edit/edit-form.tsx`. Add imports:

```typescript
import { useState, useRef } from 'react'
import { Upload, X, CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
```

Update the `Profile` interface to include `strategy_doc_paths`:

```typescript
interface Profile {
  id: string
  device_name: string
  manufacturer: string
  emdn_code: string | null
  device_class: string | null
  intended_use: string | null
  search_strategy: { competitor_terms?: RawCompetitorEntry[]; strategy_doc_paths?: string[] } | null
}
```

Add state:

```typescript
  const [strategyFiles, setStrategyFiles] = useState<Array<{ key: string; name: string; path: string; status: 'uploading' | 'done' | 'error' }>>(
    () => (profile.search_strategy?.strategy_doc_paths ?? []).map((p, i) => ({
      key: `existing_${i}`,
      name: p.split('/').pop() ?? p,
      path: p,
      status: 'done' as const,
    }))
  )
  const strategyInputRef = useRef<HTMLInputElement>(null)
```

Add the same `handleStrategyUpload` function (use `profiles/${profile.id}/` as path prefix instead of `profiles/pending/`):

```typescript
  async function handleStrategyUpload(files: FileList | File[]) {
    const sb = createClient()
    const { data: { user: authUser } } = await sb.auth.getUser()
    if (!authUser) return

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue
      if (strategyFiles.length >= 5) break
      const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${authUser.id}/profiles/${profile.id}/${key}_${safe}`
      setStrategyFiles(prev => [...prev, { key, name: file.name, path, status: 'uploading' }])
      try {
        const { error } = await sb.storage.from('search-attachments').upload(path, file)
        setStrategyFiles(prev => prev.map(f => f.key === key ? { ...f, status: error ? 'error' : 'done' } : f))
      } catch {
        setStrategyFiles(prev => prev.map(f => f.key === key ? { ...f, status: 'error' } : f))
      }
    }
  }
```

Update `handleSubmit` to include strategy_doc_paths:

```typescript
          strategy_doc_paths: strategyFiles.filter(f => f.status === 'done').map(f => f.path),
```

Add the same upload section in the form JSX (between competitors and error display). Same JSX as profile-form.tsx step 5.

- [ ] **Step 7: Remove file upload section from search-panel.tsx**

In `app/dashboard/search/search-panel.tsx`, remove the entire file upload section (lines 784-818 — the `<section>` containing "Search Strategy Documents"). Also remove the related state and handlers that are no longer needed:

- Remove `uploadedFiles` state (line 383-385)
- Remove `isDragging` state (line 386)
- Remove the `fileInputRef` (line 414)
- Remove `handleFiles` function (lines 524-543)
- Remove `onDragOver`, `onDragLeave`, `onDrop` functions (lines 546-548)
- Remove the `uploadedFiles` from the `sessionStorage` persist effect (lines 391-399)
- Remove `uploadedFileMeta` from `loadSaved` (lines 366-368)
- Remove `UploadedFile` interface (lines 48-53)
- Remove `Upload` from lucide-react import (line 8)
- Remove `uploadedFiles.some(f => f.status === 'uploading')` checks from `saveDraft` (line 493, 849)
- Remove `uploadedPaths` from saveDraft body (line 503)

Keep the `saved?.uploadedFileMeta` backward compat but stop writing new ones.

- [ ] **Step 8: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 9: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add app/dashboard/profiles/new/profile-form.tsx app/dashboard/profiles/\[id\]/edit/edit-form.tsx app/dashboard/search/search-panel.tsx app/api/profiles/route.ts app/api/profiles/\[id\]/route.ts
git commit -m "feat(profiles): move strategy doc upload from search page to profile forms

Strategy documents now attach to individual profiles (P1, P2). Upload UI added
to both create and edit forms. Removed from search page. API schemas extended
with strategy_doc_paths in JSONB column. Max 5 files, 10MB each.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 6: Pipeline timing instrumentation (B3)

**Files:**
- Create: `supabase/migrations/064_search_runs_timing.sql`
- Modify: `lib/pipeline/run-search.ts`
- Modify: `lib/pipeline/types.ts`

Add per-stage timing to `search_runs` so we can make data-driven decisions about AI concurrency tuning and BfArM optimization.

- [ ] **Step 1: Create the migration**

```sql
-- Add timing JSONB column to search_runs for per-stage instrumentation
ALTER TABLE search_runs ADD COLUMN IF NOT EXISTS timing jsonb DEFAULT NULL;

COMMENT ON COLUMN search_runs.timing IS 'Per-stage timing data in milliseconds for pipeline performance analysis';
```

- [ ] **Step 2: Add timing to PipelineContext**

In `lib/pipeline/types.ts`, add to the `PipelineContext` interface (after `warnings: string[]`):

```typescript
  timing: Record<string, number>
```

- [ ] **Step 3: Initialize timing in run-search.ts and record per-stage durations**

In `lib/pipeline/run-search.ts`, add `timing: {}` to the ctx initialization (line 92):

```typescript
  const ctx: PipelineContext = {
    runId, payload, db, profile: profile as ProfileRow, aiOptOut, searchTerms, competitorTerms, activeSources,
    items: [], contentChanged: new Set(), canonicalIds: new Map(),
    insertedRows: [], decisions: [], warnings: [],
    onProgress,
    isCancelled,
    timing: {},
  }
```

Update the stage loop to record timing (replace the try block around line 116-118):

```typescript
    try {
      await stage(ctx)
      const elapsed = Date.now() - stageStart
      ctx.timing[`${stageName}_ms`] = elapsed
      console.error(`[pipeline] run_id=${runId} stage=${stageName} completed in ${Math.round(elapsed / 1000)}s (items=${ctx.items.length} warnings=${ctx.warnings.length})`)
    } catch (err) {
```

After the finalize stage succeeds (after line 141), persist timing:

```typescript
  try {
    await finalizeStage(ctx)
    ctx.timing.total_items_scraped = ctx.items.length
    ctx.timing.total_items_filtered = ctx.decisions.length
    await db.from('search_runs').update({ timing: ctx.timing }).eq('id', runId)
  } catch (err) {
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/064_search_runs_timing.sql lib/pipeline/run-search.ts lib/pipeline/types.ts
git commit -m "feat(pipeline): add per-stage timing instrumentation to search_runs

New timing JSONB column records scrape/insert/filter/persist durations in ms
plus total_items_scraped and total_items_filtered. Enables data-driven
decisions for AI concurrency tuning (B4) and BfArM pagination optimization.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 7: Duplicate competitor handling UI note (A3)

**Files:**
- Modify: `app/dashboard/profiles/new/profile-form.tsx`
- Modify: `app/dashboard/profiles/[id]/edit/edit-form.tsx`

Already handled in Task 5 — the `<p>` tag below the upload section includes the guidance text. This task is to verify it's present and correct in both forms.

- [ ] **Step 1: Verify the note exists in both forms**

Confirm both `profile-form.tsx` and `edit-form.tsx` contain:

```
If your uploaded strategy document already contains competitor information, you don't need to re-enter it in the competitor list above.
```

- [ ] **Step 2: No commit needed — already included in Task 5 commit**

---

### Task 8: Full verification pass

**Files:** All modified files

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing 186 + new competitor token tests).

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: Nothing uncommitted.

- [ ] **Step 4: Review commit log**

Run: `git log --oneline -10`
Expected: 6 new commits in order (B1, B2, C1, C2, A2, B3).
