# DB–Code Cohesion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every column-name mismatch between live DB and application code by wiring the generated `types/supabase.ts` into all Supabase clients, fixing 6 concrete mismatches, and locking correctness with two integration tests.

**Architecture:** `types/supabase.ts` (generated from the live project `<project-ref>`) is the single source of truth. All three Supabase client factories receive the `Database` generic — any future column drift becomes a TypeScript compile error before it reaches production. Column fixes are surgical edits with no behaviour changes beyond making inserts succeed.

**Tech Stack:** Next.js 16, TypeScript, Supabase JS v2 (`@supabase/supabase-js`, `@supabase/ssr`), Vitest.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `lib/supabase/admin.ts` | Add `Database` generic to `createClient` |
| Modify | `lib/supabase/server.ts` | Add `Database` generic to `createServerClient` |
| Modify | `lib/supabase/client.ts` | Add `Database` generic to `createBrowserClient` |
| Modify | `lib/pipeline/run-search.ts:245` | `source:` → `source_db:` |
| Modify | `lib/pipeline/run-search.ts:387` | Add `stage: 'stage1'` to filter_decisions insert |
| Modify | `app/api/search-runs/[id]/route.ts:75` | `r.source` → `r.source_db` |
| Modify | `app/dashboard/archive/[id]/page.tsx:50` | `'source'` → `'source_db'` in select string |
| Modify | `app/dashboard/archive/[id]/page.tsx:78` | `r.source` → `r.source_db` |
| Modify | `app/api/reports/route.ts:446` | `r.source` → `r.source_db` |
| Create | `__tests__/db-roundtrip.test.ts` | Integration tests for fsn_results + filter_decisions |

---

## Task 1: Wire `Database` generic into all three Supabase clients

**Files:**
- Modify: `lib/supabase/admin.ts`
- Modify: `lib/supabase/server.ts`
- Modify: `lib/supabase/client.ts`

- [ ] **Step 1: Update `lib/supabase/admin.ts`**

Replace the entire file with:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Service-role client — bypasses RLS.
 * Only use in trusted server contexts (webhooks, background jobs).
 * Never expose to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 2: Update `lib/supabase/server.ts`**

Replace the entire file with:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — middleware handles session refresh
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Update `lib/supabase/client.ts`**

Replace the entire file with:

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: errors appear for every column name mismatch in the codebase — that is correct and expected at this stage. If zero errors appear, something is wrong with the generic wiring. Proceed either way.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/admin.ts lib/supabase/server.ts lib/supabase/client.ts types/supabase.ts
git commit -m "feat(types): wire Database generic into all Supabase clients

types/supabase.ts generated from live project <project-ref>.
All three client factories now typed — column name mismatches are
TypeScript compile errors.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix the 6 column mismatches

**Files:**
- Modify: `lib/pipeline/run-search.ts`
- Modify: `app/api/search-runs/[id]/route.ts`
- Modify: `app/dashboard/archive/[id]/page.tsx`
- Modify: `app/api/reports/route.ts`

These are surgical single-line edits. The generated types now flag each one as a compile error — fix them in order.

- [ ] **Step 1: Fix `run-search.ts` — fsn_results INSERT (`source_db`)**

In `lib/pipeline/run-search.ts` around line 245, change:
```typescript
        source:       item.source_db,
```
to:
```typescript
        source_db:    item.source_db,
```

- [ ] **Step 2: Fix `run-search.ts` — filter_decisions INSERT (missing `stage`)**

In `lib/pipeline/run-search.ts` around line 379-390, in the `decisions.map((d) => ({...}))` block, add `stage: 'stage1'` after `model_used`:

```typescript
      decisions.map((d) => ({
        fsn_result_id: d.fsn_result_id,
        search_run_id: runId,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence,
        model_used:    d.model,
        stage:         'stage1',
      })),
```

- [ ] **Step 3: Fix GET route — result mapping**

In `app/api/search-runs/[id]/route.ts` around line 75, change:
```typescript
    source:       r.source,
```
to:
```typescript
    source:       r.source_db,
```

- [ ] **Step 4: Fix archive page — SELECT string**

In `app/dashboard/archive/[id]/page.tsx` around line 50, change:
```typescript
    .select('id, title, manufacturer, fsn_date, source_url, source')
```
to:
```typescript
    .select('id, title, manufacturer, fsn_date, source_url, source_db')
```

- [ ] **Step 5: Fix archive page — result mapping**

In `app/dashboard/archive/[id]/page.tsx` around line 78, change:
```typescript
    source_db:       r.source,
```
to:
```typescript
    source_db:       r.source_db,
```

- [ ] **Step 6: Fix reports route — result mapping**

In `app/api/reports/route.ts` around line 446, change:
```typescript
    source_db:       r.source,
```
to:
```typescript
    source_db:       r.source_db,
```

- [ ] **Step 7: Run TypeScript check — must be zero errors**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors). If errors remain, fix them before proceeding.

- [ ] **Step 8: Commit**

```bash
git add lib/pipeline/run-search.ts "app/api/search-runs/[id]/route.ts" "app/dashboard/archive/[id]/page.tsx" app/api/reports/route.ts
git commit -m "fix(column-names): restore source_db and add stage to filter_decisions

- run-search.ts: source_db (NOT NULL) was incorrectly changed to source
- run-search.ts: add stage='stage1' to filter_decisions insert (NOT NULL, no default)
- search-runs GET route: read r.source_db not r.source
- archive page: select source_db column and map it correctly
- reports route: map r.source_db not r.source

All mismatches now caught at compile time via Database generic.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Write integration tests for fsn_results and filter_decisions

**Files:**
- Create: `__tests__/db-roundtrip.test.ts`

These tests use the real Supabase admin client against the live database. They are skipped automatically when `SUPABASE_SERVICE_ROLE_KEY` is not set (CI without secrets). Locally and on Render they run against the real DB and confirm the full INSERT→SELECT round-trip works for both tables.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/db-roundtrip.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const skip = !url || !serviceKey

const db = skip
  ? null
  : createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

// ── Shared test state ──────────────────────────────────────────────────────────

let testRunId:    string
let testResultId: string

// We need a real user_id and profile_id to satisfy FK constraints.
// Use the first user and profile found — these tests read-then-insert,
// never modify existing data, and clean up after themselves.
let userId:    string
let profileId: string

beforeAll(async () => {
  if (skip) return

  const { data: user } = await db!.from('users').select('id').limit(1).single()
  expect(user, 'Need at least one user in DB to run integration tests').toBeTruthy()
  userId = user!.id

  const { data: profile } = await db!.from('product_profiles').select('id').limit(1).single()
  expect(profile, 'Need at least one profile in DB to run integration tests').toBeTruthy()
  profileId = profile!.id

  // Create a test search_run
  const { data: run, error } = await db!.from('search_runs').insert({
    profile_id:  profileId,
    user_id:     userId,
    status:      'complete',
    period_from: '2026-01-01',
    period_to:   '2026-01-31',
  }).select('id').single()

  expect(error).toBeNull()
  testRunId = run!.id
})

afterAll(async () => {
  if (skip || !testRunId) return
  // filter_decisions cascade-delete when fsn_results row is deleted.
  // fsn_results cascade-delete when search_run is deleted.
  await db!.from('search_runs').delete().eq('id', testRunId)
})

// ── fsn_results round-trip ─────────────────────────────────────────────────────

describe('fsn_results INSERT → SELECT round-trip', () => {
  it.skipIf(skip)('inserts a row with source_db and reads it back', async () => {
    const { data, error } = await db!.from('fsn_results').insert({
      run_id:     testRunId,
      title:      'Integration test FSN',
      source_db:  'bfarm',
      source_url: 'https://example.com/fsn/test',
    }).select('id, source_db').single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.source_db).toBe('bfarm')
    testResultId = data!.id
  })
})

// ── filter_decisions round-trip ────────────────────────────────────────────────

describe('filter_decisions INSERT → SELECT round-trip', () => {
  it.skipIf(skip)('inserts a row with stage and reads it back', async () => {
    expect(testResultId, 'fsn_results test must run first').toBeTruthy()

    const { data, error } = await db!.from('filter_decisions').insert({
      fsn_result_id: testResultId,
      search_run_id: testRunId,
      decision:      'relevant',
      rationale:     'Integration test',
      stage:         'stage1',
    }).select('id, stage, decision').single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.stage).toBe('stage1')
    expect(data!.decision).toBe('relevant')
  })
})
```

- [ ] **Step 2: Run tests — expect skipped or passing**

```bash
npx vitest run __tests__/db-roundtrip.test.ts 2>&1
```

Expected output (if env vars present): both tests pass.
Expected output (if env vars absent): tests show as skipped — that is correct.

If a test fails with a DB error, the error message will contain the exact column that's wrong. Fix that column and re-run before proceeding.

- [ ] **Step 3: Commit**

```bash
git add __tests__/db-roundtrip.test.ts
git commit -m "test(integration): fsn_results + filter_decisions INSERT→SELECT round-trips

Tests confirm source_db (NOT NULL) and stage (NOT NULL) columns accept
inserts and are readable. Skip automatically when SUPABASE_SERVICE_ROLE_KEY
is not set. Cascade cleanup via search_runs delete.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Final verification

- [ ] **Step 1: Full test suite**

```bash
npx vitest run 2>&1
```

Expected: all tests pass (db-roundtrip tests either pass or are skipped, manufacturer-terms tests pass).

- [ ] **Step 2: TypeScript check — zero errors**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 3: Push to production**

```bash
git push origin main
```

Wait for Render to redeploy (watch for `Your service is live` in Render logs).

- [ ] **Step 4: Run one search in production and confirm logs**

In Render logs, look for:
```
[pipeline] step2: inserting N items to fsn_results run_id=...
[pipeline] step2: insert complete — rows_returned=N error=none
[pipeline] step4: inserting N decisions to filter_decisions run_id=...
[pipeline] step4: insert complete — error=none
```

`rows_returned` must be > 0. `error` must be `none` for both steps.

- [ ] **Step 5: Confirm Relevant tab in UI**

Open the completed search run. The Relevant tab count must match the number from the search notification email / in-run count.

- [ ] **Step 6: Confirm PDF**

Generate a report for the run. The PDF must contain actual FSN entries, not an empty table.

---

## Self-Review

**Spec coverage check:**
- Section 1 (wire Database generic): Task 1 ✓
- Section 2 (fix 6 column mismatches): Task 2 ✓ — all 6 rows from the approved table are covered
- Section 3 (integration tests): Task 3 ✓ — covers fsn_results `source_db` and filter_decisions `stage`
- Section 4 (migration 031): no code change needed per design ✓

**Placeholder scan:** None found.

**Type consistency:** `Database` type imported from `@/types/supabase` consistently across all tasks. `db-roundtrip.test.ts` uses direct `createClient<Database>` (not the wrapper functions) so no circular dependency on the clients being fixed in Task 1.
