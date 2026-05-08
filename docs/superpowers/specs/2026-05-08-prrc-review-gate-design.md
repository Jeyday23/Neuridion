# PRRC Review Gate — 3-Step Compliance Flow

**Date:** 2026-05-08
**Status:** Approved
**Owner:** Jeremiah

## Purpose

Add a mandatory two-step review gate on completed search runs before reports can be generated. This ensures the PRRC (Person Responsible for Regulatory Compliance) explicitly reviews and approves results before any compliance report is produced.

## Flow

```
draft → reviewed → approved → report generation unlocked
```

- Same user performs both steps (no role differentiation).
- Steps are sequential — skipping from `draft` to `approved` is rejected.
- Only shown on completed runs (`status === 'complete'`).

## Schema (Migration 034)

Already exists as `supabase/migrations/034_search_runs_review_status.sql`. No changes needed.

```sql
ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'reviewed', 'approved')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
```

## API: PATCH `/api/search-runs/[id]/review`

- **Auth:** Session required. Run must belong to the authenticated user.
- **Input:** `{ review_status: 'reviewed' | 'approved' }` (Zod validated)
- **Transition rules:**
  - Current `draft` → only accepts `reviewed`
  - Current `reviewed` → only accepts `approved`
  - Any other transition → 422 with error message
- **On success:** Updates `review_status`, `reviewed_by`, `reviewed_at`. Returns updated row.
- **Audit:** Logs `prrc_review_completed` with `{ run_id, review_status }`.

## UI: Review Banner

Client component on the run detail page (`/dashboard/archive/[id]`). Three visual states:

| Current status | Banner color | Message | Action |
|---|---|---|---|
| `draft` | Amber | "Not yet reviewed. This search must be reviewed before a report can be generated." | Button: "Mark as Reviewed" |
| `reviewed` | Blue | "Reviewed. Awaiting approval before report generation." | Button: "Approve for Reporting" |
| `approved` | Green | "Approved — this search is ready for report generation." | No action |

Only rendered when `run.status === 'complete'`.

## Report Generation Gate

In `app/api/reports/route.ts`, block report generation unless `review_status === 'approved'`.

Error message: "This search must be reviewed and approved before generating a report."

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/034_search_runs_review_status.sql` | No change |
| `app/api/search-runs/[id]/review/route.ts` | Add transition validation |
| `app/dashboard/archive/[id]/review-banner.tsx` | Add blue "reviewed" state with Approve button |
| `app/dashboard/archive/[id]/page.tsx` | No logic change needed |
| `app/api/reports/route.ts` | Tighten gate to require `approved` |
| `lib/audit.ts` | No change needed |
| Supabase generated types | Regenerate after migration applied |

## Out of Scope

- Role-based approval (e.g., admin-only approval)
- Review comments or rejection flow
- Notification emails on status change
