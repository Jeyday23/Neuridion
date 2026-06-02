# Production Audit Remediation

**Date:** 2026-06-02
**Status:** Approved
**Genius Council:** Unanimous (5/5 lenses aligned)
**Scope:** 10 findings from PRRC + 10x Engineer deep audit (mobile sidebar deferred, date range validation already fixed)

## Context

A comprehensive production audit of Neuridion at kodex-4-medical.onrender.com identified 12 findings across GDPR compliance, security, i18n, UI/UX, and code quality. The mobile sidebar fix is deferred to a later sprint. Fix 3 (date range validation) was already resolved — `SearchRunBodySchema` in `app/api/search-runs/route.ts:39` already has a `superRefine` check with `from > to` validation and 5-year max span. The remaining 10 findings are addressed here in two batches: backend-first (zero UI risk), then frontend/UX.

## Batch 1 — Backend Fixes (zero UI risk)

### Fix 1: GDPR login_attempts hash mismatch (CRITICAL)

**Root cause:** `app/api/worker/cleanup/route.ts:116` hashes `user.id` to find login_attempts records, but `lib/rate-limit.ts:46` stores them keyed by `SHA-256(email.toLowerCase())`. The hashes never match, so login attempts for deleted users persist indefinitely — violating GDPR Art. 17.

**Fix:** In `processExpiredDeletions()`, fetch the user's email from `auth.users` via `db.auth.admin.getUserById(user.id)` before the auth user is deleted. Hash the email with the same algorithm as `recordLoginAttempt()`:
```typescript
const { data: authUser } = await db.auth.admin.getUserById(user.id)
const email = authUser?.user?.email
if (email) {
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
  await db.from('login_attempts').delete().eq('email', emailHash)
} else {
  console.warn(`[cleanup] Could not retrieve email for user ${user.id} — login_attempts may not be fully purged`)
}
```
Move this BEFORE the `db.auth.admin.deleteUser()` call (line 119), since after auth deletion the email is gone. Note: `gdpr_purge_user_data` RPC (line 97) runs before this but operates on the `users` table, not `auth.users` — the auth email remains available.

**Files:** `app/api/worker/cleanup/route.ts` (lines 116-117, replace and reorder). `createHash` is already imported at line 1.

**Test:** Unit test confirming hash output from cleanup matches hash output from `recordLoginAttempt()` for the same email input.

### Fix 2: Missing audit logging on 4 mutation routes

**Root cause:** These routes were written before the audit logging convention was established, or were considered "internal" and skipped.

**Routes and event types:**

| Route | Method | Event type | User ID source |
|-------|--------|------------|----------------|
| `app/api/admin/trial-codes/route.ts` | POST | `trial_code_created` | admin session user |
| `app/api/bugs/route.ts` | POST | `bug_report_submitted` | session user |
| `app/api/feedback/route.ts` | POST | `feedback_submitted` | session user |
| `app/api/worker/process-job/route.ts` | POST | `search_run_status_changed` | payload.user_id |

**Fix — two parts:**

**Part A — Extend AuditEventType:** In `lib/audit.ts`, add these four strings to the `AuditEventType` union (currently lines 40-66):
- `'trial_code_created'`
- `'bug_report_submitted'`
- `'feedback_submitted'`
- `'search_run_status_changed'`

Without this, TypeScript will reject the `logAuditEvent` calls.

**Part B — Add audit calls:** Add `import { logAuditEvent } from '@/lib/audit'` and `await logAuditEvent(userId, eventType, metadata, request)` after each successful mutation.

- For `trial-codes`, `bugs`, and `feedback`: use authenticated user ID + pass `request` for IP/UA.
- For `process-job`: use `msg.user_id` (line 34) and pass `undefined` as `request` — it runs as a QStash worker, so logging QStash's IP/UA would be misleading. Audit both the success path (line 95-101) and error path (line 114-128) with appropriate metadata.

**Files:** `lib/audit.ts` (extend union), plus 4 route files (~4 lines each including import)

### ~~Fix 3: Date range validation~~ — ALREADY RESOLVED

`SearchRunBodySchema` in `app/api/search-runs/route.ts:39` already has `.superRefine()` with `from > to` validation and 5-year max span. No work needed.

### Fix 4: Firecrawl log redaction

**Root cause:** `lib/scrapers/firecrawl.ts:56` logs up to 500 chars of raw HTTP response body on failure, which could include API keys or third-party error details.

**Fix:** Truncate to 200 chars and strip patterns that look like API keys or tokens (prefixed sequences like `sk-`, `fc-`, `Bearer`, or hex strings 32+ chars):
```typescript
const safeBody = rawBody.slice(0, 200)
  .replace(/(?:sk-|fc-|Bearer\s+)[A-Za-z0-9_-]+/g, '[REDACTED]')
  .replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
console.error('[firecrawl] error response:', safeBody)
```
This avoids false positives on legitimate long words or URL paths while catching common API key formats and hex tokens.

**Files:** `lib/scrapers/firecrawl.ts` (~line 56)

### Fix 5: Unsafe type casts

**5a. GDPR export route:**
- `app/api/account/export/route.ts:21` — `(db.from as any)(table)` bypasses typed client
- **Fix:** The `batchIn` helper exists for a real reason (PostgREST URL length limits on `.in()` queries). Instead of removing it, constrain its type parameter to only accept the three tables it's used with (`'fsn_results' | 'filter_decisions' | 'profile_edit_history'`) and replace `as any` with a typed overload or a narrower assertion. This preserves the chunking logic while eliminating the `any` escape hatch.

**5b. Reports route:**
- `app/api/reports/route.ts:113` — `(d as unknown as { model?: string }).model` assumes filter_decisions has a model field
- **Fix:** Add `model` to the `.select()` string at line 101 (currently `'fsn_result_id, decision, rationale, confidence'`). Then add a local type assertion at the query site using a narrower cast: `as { fsn_result_id: string; decision: string; rationale: string; confidence: number; model?: string }[]`. This avoids `unknown` and documents the expected shape inline. If Supabase types are ever regenerated, the `model` column will be included automatically.

**Files:** `app/api/account/export/route.ts`, `app/api/reports/route.ts`

### Fix 6: Favicon

**Fix:** Use the existing `public/logo/neuridion-favicon.svg` (purpose-built favicon source) to generate `app/favicon.ico` at 32x32. The SVG already exists — convert it to ICO format.

**Files:** `app/favicon.ico` (new)

## Batch 2 — Frontend/UX Fixes

### Fix 7: i18n persistence

**Root cause:** `app/dashboard/language-context.tsx` stores locale in `useState('en')` — resets on every navigation because it's React memory, not persisted.

**Fix:** Initialize from localStorage, persist on change:
```typescript
const [locale, setLocale] = useState<Locale>('en') // SSR-safe default

useEffect(() => {
  const saved = localStorage.getItem('neuridion_locale') as Locale | null
  if (saved && saved in translations) setLocale(saved)
}, [])

const handleSetLocale = (l: Locale) => {
  setLocale(l)
  localStorage.setItem('neuridion_locale', l)
}
```
Use `useEffect` for reading localStorage so SSR always renders 'en' (no hydration mismatch). The locale updates client-side after first frame.

**Files:** `app/dashboard/language-context.tsx`

### Fix 8: i18n wiring into remaining pages

**Root cause:** `useLanguage()` is only consumed by sidebar-nav, search-panel, and search-status-widget. Profiles, archive, billing, and settings pages use hardcoded English.

**Fix — two parts:**

**Part A — Extend translations:** Add new key sections to `lib/i18n.ts` for both `en` and `de`:
- `profiles`: page title, subtitle, column headers, buttons, empty state
- `archive`: page title, subtitle, column headers, status labels, review labels, filter labels
- `billing`: page title, subtitle, plan labels, feature lists, upgrade section
- `settings`: section headings, field labels, button text, consent labels, delete section

Estimated: ~30 keys per page, 4 pages = ~120 new keys (both languages).

**Part B — Wire into pages:** In each page's client component, add `const { t } = useLanguage()` and replace hardcoded strings with `t.profiles.pageTitle`, `t.archive.columnDate`, etc.

**Important:** `billing/page.tsx` is a Server Component (async, no `'use client'`). `useLanguage()` cannot be called there. The i18n wiring for billing must go into a new client wrapper component (e.g., `billing-client.tsx`) that the server page renders, or the existing server component must be restructured. The `settings/page.tsx` delegates to `settings-client.tsx` which is already a client component — wire i18n there. The `profiles` and `archive` pages already have client components that can use the hook.

**Files:** `lib/i18n.ts`, `app/dashboard/billing/billing-client.tsx` (new client wrapper), `app/dashboard/settings/settings-client.tsx`, plus profiles and archive client components

### Fix 9: Billing plan display

**Root cause:** Billing page uses session client (`createClient()`). When `userData` is null (query fails silently due to RLS or connection error), `(userData?.plan ?? 'free')` defaults to "Free". Enterprise users set via admin override (no Stripe subscription) see incorrect plan info.

**Fix:**
1. Error logging already exists at line 27 (`console.error('[billing]', 'query error:', ...)`). No change needed.
2. If `userData` is null, show an error state ("Unable to load plan details") instead of defaulting to free.
3. Investigate RLS on `users` table — the billing page uses the session client (`createClient()` at line 16) while the settings page uses `createAdminClient()` (line 13-14), suggesting RLS may block the plan column read. Verify the `SELECT` policy allows authenticated users to read their own row. If missing, add a migration with the policy. If the RLS fix is impractical, switch billing to use the admin client like settings does.

**Files:** `app/dashboard/billing/page.tsx`, potentially a Supabase migration for RLS fix

### Fix 10: React hydration error #418

**Root cause:** Server renders with `locale='en'`, but if localStorage has `'de'`, the client would render German — mismatch. Fix 7's `useEffect` approach already solves this: server always renders 'en', client updates after mount. No additional work needed beyond Fix 7.

**Files:** None (solved by Fix 7's design)

### Fix 11: Consent records investigation

**Root cause:** Robert's account (created April 19) shows "Not recorded" for ToS and Privacy consent. Either the signup flow didn't capture consent at that time, or the settings page reads from the wrong column.

**Fix:**
1. Check whether `consent_terms_at` and `consent_privacy_at` columns have data for Robert's user row
2. If the columns are null — the signup flow at that time didn't record consent. Add a banner in settings: "Consent was not recorded at signup. Please review and accept the current Terms of Service and Privacy Policy." with an "Accept" button that writes the current timestamp.
3. If the columns have data — fix the settings page to read from the correct columns.

**Files:** `app/dashboard/settings/page.tsx` or `app/dashboard/settings/settings-form.tsx`, potentially `app/api/consent/manage/route.ts`

## Verification

**Batch 1:**
- `npx tsc --noEmit` — zero errors
- `npx vitest run` — no regressions
- Unit test for GDPR hash consistency
- `grep -r "as any\|as unknown as" app/api/` should show reduced count
- Verify `AuditEventType` union includes all 4 new event types

**Batch 2:**
- `npx tsc --noEmit` — zero errors
- Browser test: switch to German, navigate between pages, verify persistence
- Browser test: billing page shows correct plan for enterprise user
- Browser test: settings page shows consent status correctly
- No React hydration errors in console

## Out of Scope

- Mobile responsive sidebar (deferred to separate sprint)
- Duplicate user account dedup (operational, not code fix)
- Duplicate profile prevention (would require schema migration + UI changes)
