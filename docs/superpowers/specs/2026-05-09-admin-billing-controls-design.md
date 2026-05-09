# Admin Billing Controls — Design Spec

**Goal:** Give admins visibility into Anthropic credit exhaustion and subscription lapses, restrict lapsed subscribers to the billing page, and keep all billing-related UI invisible to regular users.

**Architecture:** Three changes that share a common pattern — admin-only visibility. The proxy handles access restriction at the edge, the filter pipeline writes an audit event on credit exhaustion, and the admin dashboard surfaces both signals.

**Tech Stack:** Next.js proxy, Supabase (users table + audit_log), existing admin dashboard components.

---

## Feature 1: Admin-Only Credit Exhaustion Banner (Archive Results)

**Where:** `app/dashboard/archive/[id]/page.tsx` (Server Component)

**Behaviour:**
- When `filter_failed_count > 0` on the current search run, check the logged-in user's `role` from the `users` table.
- If `role === 'admin'`: render a yellow warning banner above the results tabs.
- If `role !== 'admin'`: render nothing extra. The "Unfiltered" tab already handles visibility for regular users.

**Banner text:** "AI filtering was unavailable for {N} notices — Anthropic API credits may be exhausted. Check billing at console.anthropic.com."

**Styling:** Yellow background (`bg-amber-50 border-amber-200`), amber text, consistent with the existing MHRA warning banner pattern on that page.

**Data flow:** The page already queries `search_runs` and has `filter_failed_count`. The only new query is fetching the user's `role` — use the existing `supabase.auth.getUser()` call already present on that page, then one additional `.from('users').select('role').eq('id', user.id).single()`.

---

## Feature 2: Subscription Access Restriction

**Where:** `proxy.ts`

**Behaviour:**
- After the existing deletion check (line 81-92), add a subscription status check.
- Query `users` for `subscription_status` and `plan` (extend the existing `deleted_at` query to include these columns — one query, not two).
- If `plan` is `free` or `trial`: skip this check entirely. Free/trial users have separate limits.
- If `subscription_status` is `past_due` or `canceled`:
  - Dashboard routes: redirect all `/dashboard/*` to `/dashboard/billing`, **except** `/dashboard/billing` itself.
  - API routes: return `{ error: 'Subscription inactive — please update your payment method.' }` with status 403 for non-billing, non-public API routes. Billing API routes (`/api/billing/`) must remain accessible so the user can resubscribe.

**What "restricted" means:** The user can still log in, view the billing page, update their payment method, and resubscribe. They cannot run searches, view results, create profiles, or generate reports until their subscription is active again.

**Billing page UX:** No changes to the billing page itself — Stripe's customer portal already shows the user their payment status and allows them to update their method. The redirect is the restriction mechanism.

**Edge cases:**
- `subscription_status = 'inactive'` with `plan = 'free'`: this is the default state for free users — no restriction.
- `subscription_status = 'trialing'`: no restriction (active trial).
- `subscription_status = 'active'`: no restriction.
- User has no `users` row: treat as unrestricted (new signup, row may not exist yet).

---

## Feature 3: Admin Credit Exhaustion Monitoring

### 3a: Audit Event on Credit Exhaustion

**Where:** `lib/claude/filter-pipeline.ts`, inside `markCreditExhausted()`

**Behaviour:** When `markCreditExhausted()` is called (first credit error in a process), write an `audit_log` entry:
- `event_type`: `'ai_credit_exhausted'`
- `event_data`: `{ error: <error message>, timestamp: <ISO string> }`
- `user_id`: `null` (system event, not user-triggered)

Use `createAdminClient()` since this runs in the pipeline worker context without a user session.

### 3b: Admin Overview Dashboard

**Where:** `app/admin/page.tsx`

**Behaviour — alert banner:**
- Query `audit_log` for `event_type = 'ai_credit_exhausted'` in the last 24 hours.
- If any rows exist: render a red alert banner at the top of the admin overview page.
- Banner text: "Anthropic API credits exhausted — AI filtering is paused. All new search results will require manual review."
- Styling: Red background (`bg-red-50 border-red-200`), red text, with a dismiss-by-reload behaviour (no client state needed — it's a Server Component).

**Behaviour — stat card:**
- Add a new stat card: "Runs with unfiltered results (7d)".
- Query: `search_runs` where `filter_failed_count > 0` in the last 7 days, count.
- If count > 0: card border turns red (`border-red-300`) to draw attention.
- If count = 0: normal styling.

---

## Files Changed

| File | Change |
|------|--------|
| `proxy.ts` | Add subscription restriction check after deletion check |
| `app/dashboard/archive/[id]/page.tsx` | Add admin-only credit exhaustion banner |
| `app/admin/page.tsx` | Add credit exhaustion alert banner + unfiltered runs stat card |
| `lib/claude/filter-pipeline.ts` | Write audit_log entry in `markCreditExhausted()` |

No new files. No new dependencies. No migrations (uses existing `audit_log` and `users` columns).

---

## What Is NOT In Scope

- Email/Slack alerting for credit exhaustion (future enhancement)
- Automatic retry of `filter_failed` results after credits are restored
- Changes to the billing page itself
- Changes to Stripe webhook handling
- Rate limiting changes
