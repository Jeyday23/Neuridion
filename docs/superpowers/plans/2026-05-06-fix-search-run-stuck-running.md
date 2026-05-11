# Fix Search Run Stuck at 'running' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs that cause search_runs rows to get stuck at status='running' indefinitely, with started_at=null, invisible to the cleanup worker.

**Architecture:** Three independent root causes, each fixed with a targeted one-file change. (1) The route.ts INSERT never sets `started_at`. (2) The pipeline's Step 5 DB update discards its return value — any transient failure silently leaves the row at 'running' forever. (3) The cleanup query uses `.lt('started_at', cutoff)` which evaluates to NULL for rows where `started_at IS NULL` (PostgreSQL NULL semantics), so those rows are never cleaned up. The cleanup fix extracts a pure `isStuckRun` function for testability and replaces the single query with two Supabase queries (OR logic in Supabase JS requires raw PostgREST syntax; two queries is cleaner).

**Tech Stack:** TypeScript, Next.js 16 App Router, Supabase JS (`@supabase/supabase-js`), Vitest, `createAdminClient()` for service-role DB access.

---

## File Map

| File | Change |
|---|---|
| `__tests__/cleanup.test.ts` | New — unit tests for `isStuckRun` |
| `app/api/worker/cleanup/route.ts` | Export `isStuckRun`; replace single `.lt('started_at')` query with two-query approach |
| `app/api/search-runs/route.ts` | Add `started_at: new Date().toISOString()` to the INSERT payload |
| `lib/pipeline/run-search.ts` | Destructure Step 5 update result; throw on error |

---

## Task 1: Fix cleanup — extract `isStuckRun` and catch null started_at runs

**Root cause:** `.lt('started_at', cutoff)` in PostgreSQL returns NULL (not TRUE) when `started_at IS NULL`. Runs with no `started_at` are permanently invisible to cleanup and stay stuck at 'running' forever.

**Files:**
- Create: `__tests__/cleanup.test.ts`
- Modify: `app/api/worker/cleanup/route.ts` (lines 7–44)

- [ ] **Step 1: Write failing tests**

Create `__tests__/cleanup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isStuckRun } from '@/app/api/worker/cleanup/route'

const CUTOFF = new Date('2026-05-06T08:00:00.000Z')

describe('isStuckRun', () => {
  it('returns false when status is not running', () => {
    expect(isStuckRun({ status: 'complete',  started_at: '2026-05-06T07:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'error',     started_at: null,                        created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'cancelled', started_at: null,                        created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
  })

  it('returns true when started_at is before cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: '2026-05-06T07:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(true)
  })

  it('returns false when started_at is at or after cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: '2026-05-06T08:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'running', started_at: '2026-05-06T09:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
  })

  // THE BUG CASES — null started_at was previously invisible to the DB query
  it('returns true when started_at is null and created_at is before cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: null, created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(true)
  })

  it('returns false when started_at is null and created_at is at or after cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: null, created_at: '2026-05-06T08:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'running', started_at: null, created_at: '2026-05-06T09:00:00.000Z' }, CUTOFF)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx vitest run __tests__/cleanup.test.ts
```

Expected: FAIL — `isStuckRun` is not exported from `@/app/api/worker/cleanup/route`.

- [ ] **Step 3: Rewrite cleanup/route.ts with isStuckRun export and two-query approach**

Replace the entire contents of `app/api/worker/cleanup/route.ts` with:

```typescript
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'

// Runs stuck longer than this are considered dead (Render/Cloudflare timeout is ~30 min)
const STUCK_THRESHOLD_MINUTES = 20

/**
 * A run is stuck if it has been in 'running' status past the cutoff.
 * Uses created_at as fallback anchor when started_at is null — the route that
 * creates runs sometimes fails to set started_at, leaving it permanently null.
 * PostgreSQL NULL semantics mean `started_at < cutoff` evaluates to NULL (not TRUE)
 * for null rows, so a started_at-only query silently misses them.
 */
export function isStuckRun(
  run: { status: string; started_at: string | null; created_at: string },
  cutoff: Date,
): boolean {
  if (run.status !== 'running') return false
  const anchor = run.started_at ? new Date(run.started_at) : new Date(run.created_at)
  return anchor < cutoff
}

async function runCleanup(): Promise<{ cleaned: number; run_ids: string[] }> {
  const db     = createAdminClient()
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000)
  const cutoffIso = cutoff.toISOString()
  const now       = new Date().toISOString()

  // Two separate queries because Supabase JS OR with IS NULL requires raw PostgREST
  // syntax that is error-prone. Two clean queries are easier to read and maintain.
  const [byStartedAt, byCreatedAt] = await Promise.all([
    db.from('search_runs').select('id').eq('status', 'running').lt('started_at', cutoffIso),
    db.from('search_runs').select('id').eq('status', 'running').is('started_at', null).lt('created_at', cutoffIso),
  ])

  const stuckIds = [
    ...new Set([
      ...(byStartedAt.data ?? []).map((r) => r.id),
      ...(byCreatedAt.data ?? []).map((r) => r.id),
    ]),
  ]

  if (stuckIds.length === 0) {
    console.log('[cleanup] no stuck runs found')
    return { cleaned: 0, run_ids: [] }
  }

  const [runsResult, queueResult] = await Promise.all([
    db.from('search_runs').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received. Please retry.',
      completed_at: now,
    }).in('id', stuckIds),
    db.from('search_job_queue').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received.',
      completed_at: now,
    }).in('run_id', stuckIds).not('status', 'in', '("completed","failed")'),
  ])

  if (runsResult.error)  console.error('[cleanup] search_runs update failed:', runsResult.error.message)
  if (queueResult.error) console.error('[cleanup] search_job_queue update failed:', queueResult.error.message)

  console.log(`[cleanup] marked ${stuckIds.length} stuck run(s) as failed: ${stuckIds.join(', ')}`)
  return { cleaned: stuckIds.length, run_ids: stuckIds }
}

// POST — called by QStash hourly schedule (signature verified in production)
async function postHandler(_req: Request): Promise<Response> {
  const result = await runCleanup()
  return Response.json(result)
}

export const POST =
  process.env.NODE_ENV === 'development'
    ? postHandler
    : verifySignatureAppRouter(postHandler)

// GET — manual invocation from browser or curl (no auth, stats are non-sensitive)
export async function GET() {
  const result = await runCleanup()
  return Response.json(result)
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx vitest run __tests__/cleanup.test.ts
```

Expected: 6/6 PASS.

- [ ] **Step 5: Run all tests and TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx vitest run && npx tsc --noEmit 2>&1
```

Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add __tests__/cleanup.test.ts app/api/worker/cleanup/route.ts
git commit -m "fix(cleanup): catch stuck runs with null started_at — PostgreSQL NULL semantics broke the lt filter"
```

---

## Task 2: Fix route.ts — set started_at at run creation

**Root cause:** The INSERT that creates the search run sets `status: 'running'` but never sets `started_at`. The `started_at` column in migration 002 is `timestamptz` with no default, so it remains NULL.

**Why this matters even after Task 1:** Without `started_at`, the cleanup worker uses `created_at` as the anchor (correct after Task 1). But more importantly, `started_at` is the canonical "when did this run begin" timestamp used in analytics, UI, and export. It should be set at run start.

**Files:**
- Modify: `app/api/search-runs/route.ts:101-111`

No extractable pure logic here — the fix is a 1-line addition to the INSERT payload. TypeScript compilation confirms correctness (Supabase types will accept a nullable timestamptz column receiving an ISO string).

- [ ] **Step 1: Apply the fix**

In `app/api/search-runs/route.ts`, find the INSERT block (lines ~101-111):

```typescript
// BEFORE
const { data: run, error: runError } = await db
  .from('search_runs')
  .insert({
    profile_id,
    user_id:    user.id,
    status:     'running',
    period_from,
    period_to,
  })
  .select()
  .single()
```

Change to:

```typescript
// AFTER
const { data: run, error: runError } = await db
  .from('search_runs')
  .insert({
    profile_id,
    user_id:     user.id,
    status:      'running',
    started_at:  new Date().toISOString(),
    period_from,
    period_to,
  })
  .select()
  .single()
```

- [ ] **Step 2: Run all tests and TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx vitest run && npx tsc --noEmit 2>&1
```

Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/search-runs/route.ts
git commit -m "fix(search-runs): set started_at on run creation — column was always null"
```

---

## Task 3: Fix pipeline — throw on Step 5 update failure

**Root cause:** `runSearchPipeline` in `lib/pipeline/run-search.ts` lines 383-392 does:
```typescript
await db.from('search_runs').update({...}).eq('id', runId)
```
The Supabase JS client returns `{ data, error }` and NEVER throws. Without destructuring and checking `error`, any failure (network blip, PostgREST error, constraint violation) silently passes. The pipeline function returns normally, the caller (`route.ts`) reads back the row and finds it still 'running', and returns `status: 'running'` to the client.

If we throw on error, the route's existing `catch` block handles it:
```typescript
catch (err) {
  await db.from('search_runs').update({ status: 'error', error: msg, completed_at: now })
  return Response.json({ error: '...' }, { status: 500 })
}
```
The user gets an error response instead of a silent stuck run.

**Files:**
- Modify: `lib/pipeline/run-search.ts:383-392`

No extractable pure logic — the fix is destructuring the DB call and adding a throw. TypeScript compilation verifies correctness.

- [ ] **Step 1: Apply the fix**

In `lib/pipeline/run-search.ts`, find the Step 5 update (lines ~374-392):

```typescript
// BEFORE
  await db.from('search_runs').update({
    status:              runStatus,
    error:               allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    progress:            null,
  }).eq('id', runId)
```

Change to:

```typescript
// AFTER — throw on error so the route's catch handler sets status='error' instead
// of leaving the run stuck at 'running' with no completed_at
  const { error: finalizeError } = await db.from('search_runs').update({
    status:              runStatus,
    error:               allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    progress:            null,
  }).eq('id', runId)
  if (finalizeError) throw new Error(`Failed to finalize run ${runId}: ${finalizeError.message}`)
```

- [ ] **Step 2: Run all tests and TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx vitest run && npx tsc --noEmit 2>&1
```

Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/run-search.ts
git commit -m "fix(pipeline): throw on Step 5 finalize failure — silent Supabase error left runs stuck at 'running'"
```

---

## Task 4: Push and deploy

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

- [ ] **Step 2: Verify Render deployment**

Render auto-deploys on push to `main`. Monitor the hosting dashboard — wait for "Deploy live" on the production service.

- [ ] **Step 3: Smoke test**

Run a search in the NEURIDION dashboard. After completion, confirm the DB row (via Supabase dashboard or logs) shows:
- `status: 'complete'` (not 'running')
- `started_at` is not null
- `completed_at` is not null
