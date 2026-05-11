# Three Production Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three production bugs: (1) Relevant tab always shows 0 despite correct count in notification, (2) model label shows "claude-sonnet-4-6" instead of the two-stage architecture, (3) QStash re-delivers completed jobs causing duplicate pipeline runs.

**Architecture:** All three bugs are isolated one-file fixes + one new migration. No architectural changes. Root causes confirmed via code inspection: wrong Supabase client for data queries, stale hardcoded constant, and missing idempotency guard.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS client, Vitest, @upstash/qstash

---

## File Structure

| File | Change |
|---|---|
| `app/api/search-runs/[id]/route.ts` | Add `const db = createAdminClient()`; switch `fsn_results` + `filter_decisions` queries from `supabase` → `db` |
| `supabase/migrations/030_fix_filter_decisions_schema.sql` | **New** — rename `model`→`model_used`, add `stage` column (IF EXISTS guards) |
| `app/dashboard/search/search-panel.tsx` | Change `MODEL_LABEL` constant from `'claude-sonnet-4-6'` to `'Haiku + Sonnet'` |
| `app/api/worker/process-job/route.ts` | Add idempotency check at top of handler: skip if `run.status !== 'pending'` |
| `app/api/search-runs/route.ts` | Change `retries: 3` → `retries: 0` in `qstash.publishJSON` |
| `__tests__/three-bug-fixes.test.ts` | **New** — 6 structural assertions covering all three bugs |

---

## Task 1: Bug 1 — Write failing structural test

**Files:**
- Create: `__tests__/three-bug-fixes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/three-bug-fixes.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const getRun  = readFileSync(join(process.cwd(), 'app/api/search-runs/[id]/route.ts'), 'utf-8')
const panel   = readFileSync(join(process.cwd(), 'app/dashboard/search/search-panel.tsx'), 'utf-8')
const worker  = readFileSync(join(process.cwd(), 'app/api/worker/process-job/route.ts'), 'utf-8')
const postRun = readFileSync(join(process.cwd(), 'app/api/search-runs/route.ts'), 'utf-8')

describe('Bug 1 — GET /api/search-runs/[id] uses admin client for data queries', () => {
  it('queries fsn_results with admin client', () => {
    expect(getRun).toContain("db.from('fsn_results')")
  })
  it('queries filter_decisions with admin client', () => {
    expect(getRun).toContain("db.from('filter_decisions')")
  })
})

describe('Bug 2 — MODEL_LABEL reflects two-stage pipeline', () => {
  it('does not show sonnet-only label', () => {
    expect(panel).not.toContain("MODEL_LABEL = 'claude-sonnet-4-6'")
  })
  it('shows Haiku in the label', () => {
    expect(panel).toContain('Haiku')
  })
})

describe('Bug 3 — QStash double delivery prevention', () => {
  it('process-job has idempotency check for non-pending status', () => {
    expect(worker).toContain("status !== 'pending'")
  })
  it('QStash publishJSON uses retries: 0', () => {
    expect(postRun).toContain('retries: 0')
  })
})
```

- [ ] **Step 2: Run test to verify all 6 fail**

```bash
npx vitest run __tests__/three-bug-fixes.test.ts
```

Expected: 6 tests FAIL

---

## Task 2: Bug 1 — Switch GET data queries to admin client

**Files:**
- Modify: `app/api/search-runs/[id]/route.ts`

- [ ] **Step 1: Add `const db = createAdminClient()` and switch data queries**

Current file starts with:
```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(...) {
  const { id } = await params
  const supabase = await createClient()
  // ...auth checks use supabase (keep)...
  // data queries use supabase (CHANGE to db)
  const { data: results, error: resultsError } = await supabase
    .from('fsn_results')...
  // ...
  const { data: decisions } = await supabase
    .from('filter_decisions')...
```

Change to: add `const db = createAdminClient()` right after `const supabase = await createClient()`, then replace the two data queries:

```typescript
  const supabase = await createClient()
  const db       = createAdminClient()
```

Then:
```typescript
  // Fetch FSN results for this run — use admin client to bypass RLS on internal tables
  const { data: results, error: resultsError } = await db
    .from('fsn_results')
    .select('*')
    .eq('run_id', id)
    .order('fsn_date', { ascending: false })
```

And:
```typescript
  if (resultIds.length > 0) {
    const { data: decisions } = await db
      .from('filter_decisions')
      .select('fsn_result_id, decision, rationale, confidence, model_used')
      .in('fsn_result_id', resultIds)
```

- [ ] **Step 2: Run the structural test — expect Bug 1 tests to pass**

```bash
npx vitest run __tests__/three-bug-fixes.test.ts
```

Expected: Bug 1 tests (2/6) now PASS, others still FAIL

---

## Task 3: Bug 1 bonus — Migration 030

**Files:**
- Create: `supabase/migrations/030_fix_filter_decisions_schema.sql`

- [ ] **Step 1: Create the migration**

```sql
-- 030_fix_filter_decisions_schema.sql
-- filter_decisions was created with a 'model' column (migration 003) but
-- application code uses 'model_used'. The pipeline also inserts a 'stage'
-- column that never existed in the original schema.
-- IF EXISTS guards make this safe on both production (already patched) and
-- fresh deployments (applies the rename/add for the first time).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'model'
  ) THEN
    ALTER TABLE public.filter_decisions RENAME COLUMN model TO model_used;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'model_used'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN model_used text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'stage'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN stage text NOT NULL DEFAULT 'stage1';
  END IF;
END $$;
```

No vitest test for a migration — verify TypeScript still compiles after this task.

---

## Task 4: Bug 2 — MODEL_LABEL constant

**Files:**
- Modify: `app/dashboard/search/search-panel.tsx` (last line, currently `const MODEL_LABEL = 'claude-sonnet-4-6'`)

- [ ] **Step 1: Change the constant**

Find (line ~985):
```typescript
const MODEL_LABEL = 'claude-sonnet-4-6'
```

Replace with:
```typescript
const MODEL_LABEL = 'Haiku + Sonnet'
```

- [ ] **Step 2: Run structural test — expect Bug 2 tests to pass**

```bash
npx vitest run __tests__/three-bug-fixes.test.ts
```

Expected: 4/6 now PASS (Bug 1 + Bug 2), Bug 3 still FAIL

---

## Task 5: Bug 3 — Idempotency check + retries:0

**Files:**
- Modify: `app/api/worker/process-job/route.ts`
- Modify: `app/api/search-runs/route.ts`

- [ ] **Step 1: Add idempotency check to process-job handler**

In `app/api/worker/process-job/route.ts`, immediately after parsing the message (after `const { run_id, job_id, ...jobPayload } = msg`), add:

```typescript
  console.log(`[process-job] received run_id=${run_id} job_id=${job_id}`)

  // Idempotency guard — QStash may retry if Cloudflare times out the response
  // before the pipeline finishes. If the run is no longer pending, it's already
  // being processed or has completed; return 200 to stop further retries.
  const { data: existingRun } = await db
    .from('search_runs')
    .select('status')
    .eq('id', run_id)
    .single()

  if (existingRun?.status !== 'pending') {
    console.log(`[process-job] run_id=${run_id} status=${existingRun?.status} — duplicate delivery, skipping`)
    return new Response('Already processed', { status: 200 })
  }
```

This block goes between the `console.log` on line 18 and the `await Promise.all([...])` on line 20.

- [ ] **Step 2: Change retries: 3 → retries: 0 in app/api/search-runs/route.ts**

Find:
```typescript
    await qstash.publishJSON({
      url:     `${process.env.NEXT_PUBLIC_SITE_URL}/api/worker/process-job`,
      body:    message,
      retries: 3,
      timeout: 900,
    })
```

Replace with:
```typescript
    await qstash.publishJSON({
      url:     `${process.env.NEXT_PUBLIC_SITE_URL}/api/worker/process-job`,
      body:    message,
      retries: 0,
      timeout: 900,
    })
```

- [ ] **Step 3: Run structural test — expect all 6 to pass**

```bash
npx vitest run __tests__/three-bug-fixes.test.ts
```

Expected: 6/6 PASS

---

## Task 6: Full suite + TypeScript + commit + push

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (was 93 before these changes)

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add \
  "app/api/search-runs/[id]/route.ts" \
  supabase/migrations/030_fix_filter_decisions_schema.sql \
  app/dashboard/search/search-panel.tsx \
  app/api/worker/process-job/route.ts \
  app/api/search-runs/route.ts \
  __tests__/three-bug-fixes.test.ts

git commit -m "fix: three production bugs — relevant tab 0, model label, QStash double delivery

Bug 1: GET /api/search-runs/[id] was using user-scoped Supabase client for
fsn_results and filter_decisions queries. RLS on filter_decisions silently
returned empty for user client → all filter_decision null → tab counts 0.
Fix: use createAdminClient() for data queries (auth/ownership still via user
client). Also adds migration 030 to reconcile filter_decisions schema (model
→ model_used, add stage column) with what the pipeline code expects.

Bug 2: MODEL_LABEL was hardcoded to 'claude-sonnet-4-6'. The pipeline uses
a two-stage Haiku → Sonnet architecture. Fix: MODEL_LABEL = 'Haiku + Sonnet'.

Bug 3: process-job had no idempotency check. QStash with retries:3 would
re-deliver if Cloudflare timed out before the 15-min pipeline finished. Fix:
check run.status at handler start — skip if not 'pending'. Also sets
retries:0 in publishJSON to prevent unnecessary re-delivery attempts."
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: pushed to origin, Render deploy triggered
