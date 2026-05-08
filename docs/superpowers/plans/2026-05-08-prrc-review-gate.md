# PRRC Review Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 3-step PRRC compliance gate (draft → reviewed → approved) so users must explicitly review and approve search runs before generating reports.

**Architecture:** Migration 034 adds `review_status`, `reviewed_by`, `reviewed_at` columns to `search_runs`. A PATCH API validates sequential transitions. The review-banner client component renders 3 states. The reports route gates on `approved`. After the migration is applied, Supabase types are regenerated to fix all 35 TS errors.

**Tech Stack:** Supabase PostgreSQL, Next.js App Router, Zod, TypeScript, Supabase MCP (for migration), Supabase CLI (for type gen)

**Spec:** `docs/superpowers/specs/2026-05-08-prrc-review-gate-design.md`

---

### Task 1: Apply migration 034 to live Supabase

**Files:**
- Existing: `supabase/migrations/034_search_runs_review_status.sql`

- [ ] **Step 1: Review the migration SQL**

The migration already exists and is correct:

```sql
ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'reviewed', 'approved')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
```

Verify it hasn't already been applied:

Run: `supabase migration list --project-ref mifvyttraodneyfkdcik 2>&1 | tail -5`
Expected: migration 034 is NOT in the applied list.

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with the SQL content above against the project.

Alternatively via CLI:

Run: `supabase db push --project-ref mifvyttraodneyfkdcik`

- [ ] **Step 3: Verify columns exist**

Run via MCP `execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'search_runs'
  AND column_name IN ('review_status', 'reviewed_by', 'reviewed_at');
```

Expected: 3 rows returned with `review_status` (text, default 'draft'), `reviewed_by` (uuid), `reviewed_at` (timestamptz).

---

### Task 2: Regenerate Supabase TypeScript types

**Files:**
- Modify: `types/supabase.ts`

- [ ] **Step 1: Regenerate types from live database**

Run:
```bash
supabase gen types typescript --project-id mifvyttraodneyfkdcik > types/supabase.ts
```

- [ ] **Step 2: Verify new columns appear in generated types**

Run: `grep -A3 'review_status\|reviewed_by\|reviewed_at' types/supabase.ts`

Expected: `review_status: string`, `reviewed_by: string | null`, `reviewed_at: string | null` appear in the `Row`, `Insert`, and `Update` sections of `search_runs`.

---

### Task 3: Clear stale `.next` cache

**Files:**
- Delete: `.next/` (build cache)

- [ ] **Step 1: Remove the stale build cache**

Run: `rm -rf .next`

This fixes the phantom TS error referencing the deleted `app/api/stripe/webhook/route.js`.

- [ ] **Step 2: Verify the stale-cache TS error is gone**

Run: `npx tsc --noEmit 2>&1 | grep "stripe/webhook"`

Expected: No output (error gone).

---

### Task 4: Add transition validation to review API route

**Files:**
- Modify: `app/api/search-runs/[id]/review/route.ts` (all 68 lines)

- [ ] **Step 1: Read the current route**

Confirm the current file matches what we saw during exploration (68 lines, no transition validation, updates directly).

- [ ] **Step 2: Add transition validation logic**

Replace the update block (lines 47–56) to fetch current `review_status` first and validate the transition. The full updated file:

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'

const ReviewSchema = z.object({
  review_status: z.enum(['reviewed', 'approved']),
})

const VALID_TRANSITIONS: Record<string, string> = {
  draft: 'reviewed',
  reviewed: 'approved',
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ReviewSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const db = createAdminClient()

  const { data: existing } = await db
    .from('search_runs')
    .select('id, review_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  const allowed = VALID_TRANSITIONS[existing.review_status]
  if (allowed !== parsed.data.review_status) {
    return Response.json(
      { error: `Cannot transition from '${existing.review_status}' to '${parsed.data.review_status}'.` },
      { status: 422 }
    )
  }

  const { data: updated, error } = await db
    .from('search_runs')
    .update({
      review_status: parsed.data.review_status,
      reviewed_by:   user.id,
      reviewed_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, review_status, reviewed_by, reviewed_at')
    .single()

  if (error || !updated) {
    return Response.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'prrc_review_completed', {
    run_id:        id,
    review_status: parsed.data.review_status,
  }, request)

  return Response.json(updated)
}
```

- [ ] **Step 3: Verify TypeScript passes for this file**

Run: `npx tsc --noEmit 2>&1 | grep "review/route"`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/search-runs/[id]/review/route.ts
git commit -m "feat: add sequential transition validation to PRRC review API"
```

---

### Task 5: Update review banner with 3 states

**Files:**
- Modify: `app/dashboard/archive/[id]/review-banner.tsx` (all 54 lines)

- [ ] **Step 1: Rewrite the banner component with 3 states**

Replace the entire file with:

```tsx
'use client'

import { useState } from 'react'

type ReviewStatus = 'draft' | 'reviewed' | 'approved'

export function ReviewBanner({ runId, initialStatus }: { runId: string; initialStatus: ReviewStatus }) {
  const [status, setStatus]   = useState<ReviewStatus>(initialStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function transition(next: 'reviewed' | 'approved') {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/search-runs/${runId}/review`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ review_status: next }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to update review status')
      }
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'approved') {
    return (
      <div className="mb-6 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <strong>Approved</strong> — this search is ready for report generation.
      </div>
    )
  }

  if (status === 'reviewed') {
    return (
      <div className="mb-6 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center justify-between gap-4">
        <span>
          <strong>Reviewed.</strong> Awaiting approval before report generation.
        </span>
        <button
          onClick={() => transition('approved')}
          disabled={loading}
          className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Saving…' : 'Approve for Reporting'}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-4">
      <span>
        <strong>Not yet reviewed.</strong> This search must be reviewed and approved before a report can be generated.
      </span>
      <button
        onClick={() => transition('reviewed')}
        disabled={loading}
        className="shrink-0 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Saving…' : 'Mark as Reviewed'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript passes for this file**

Run: `npx tsc --noEmit 2>&1 | grep "review-banner"`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/archive/[id]/review-banner.tsx
git commit -m "feat: add 3-state review banner (draft/reviewed/approved)"
```

---

### Task 6: Tighten report generation gate to require 'approved'

**Files:**
- Modify: `app/api/reports/route.ts:410-416`

- [ ] **Step 1: Update the gate check**

Replace lines 410–416 in `app/api/reports/route.ts`:

```typescript
  const reviewStatus = (run as Record<string, unknown>).review_status as string | undefined
  if (!reviewStatus || reviewStatus === 'draft') {
    return Response.json(
      { error: 'This search must be marked as reviewed before generating a report.' },
      { status: 422 }
    )
  }
```

With:

```typescript
  if (run.review_status !== 'approved') {
    return Response.json(
      { error: 'This search must be reviewed and approved before generating a report.' },
      { status: 422 }
    )
  }
```

Note: After types are regenerated (Task 2), `run.review_status` is a known property — no `as Record<string, unknown>` cast needed.

- [ ] **Step 2: Verify TypeScript passes for this file**

Run: `npx tsc --noEmit 2>&1 | grep "reports/route"`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "feat: require 'approved' status before report generation"
```

---

### Task 7: Full TypeScript check and final commit

**Files:**
- All modified files

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit 2>&1`

Expected: 0 errors. If any remain, fix them before proceeding.

- [ ] **Step 2: Run tests**

Run: `npx vitest run 2>&1 | tail -10`

Expected: All tests pass, no regressions.

- [ ] **Step 3: Stage all remaining changes and commit**

```bash
git add types/supabase.ts lib/audit.ts app/dashboard/archive/[id]/page.tsx supabase/migrations/034_search_runs_review_status.sql docs/superpowers/specs/2026-05-08-prrc-review-gate-design.md docs/superpowers/plans/2026-05-08-prrc-review-gate.md
git commit -m "feat: land PRRC 3-step review gate (draft → reviewed → approved)

Applies migration 034, regenerates Supabase types, adds transition
validation, 3-state review banner, and gates reports on 'approved'."
```

- [ ] **Step 4: Push to remote**

Run: `git push origin main`

Expected: Push succeeds. Verify with `git log --oneline origin/main..HEAD` returning empty.
