# Production Audit Remediation

**Date:** 2026-06-02
**Status:** Approved
**Genius Council:** Unanimous (5/5 lenses aligned)
**Scope:** 11 findings from PRRC + 10x Engineer deep audit (mobile sidebar deferred)

## Context

A comprehensive production audit of Neuridion at kodex-4-medical.onrender.com identified 12 findings across GDPR compliance, security, i18n, UI/UX, and code quality. The mobile sidebar fix is deferred to a later sprint. The remaining 11 findings are addressed here in two batches: backend-first (zero UI risk), then frontend/UX.

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
}
```
Move this BEFORE the `db.auth.admin.deleteUser()` call (line 119), since after auth deletion the email is gone.

**Files:** `app/api/worker/cleanup/route.ts` (lines 116-117, replace and reorder)

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

**Fix:** Add `await logAuditEvent(userId, eventType, metadata, request)` after each successful mutation. For `process-job`, use `payload.user_id` since it runs as a worker (no session). For the other 3, use the authenticated user's ID.

**Files:** 4 route files, ~3 lines each

### Fix 3: Date range validation

**Root cause:** The search runs POST endpoint accepts `period_from` and `period_to` without validating that from <= to. A run with "30 Apr 2026 – 20 Apr 2026" was accepted and stored.

**Fix:** Add a Zod `.refine()` to the search runs POST schema:
```typescript
.refine(data => data.period_from <= data.period_to, {
  message: 'Start date must be before or equal to end date',
  path: ['period_from'],
})
```

**Files:** `app/api/search-runs/route.ts` (POST handler schema)

### Fix 4: Firecrawl log redaction

**Root cause:** `lib/scrapers/firecrawl.ts:56` logs up to 500 chars of raw HTTP response body on failure, which could include API keys or third-party error details.

**Fix:** Truncate to 200 chars and strip patterns that look like API keys or tokens (sequences of 20+ alphanumeric chars):
```typescript
const safeBody = rawBody.slice(0, 200).replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]')
console.error('[firecrawl] error response:', safeBody)
```

**Files:** `lib/scrapers/firecrawl.ts` (~line 56)

### Fix 5: Unsafe type casts

**5a. GDPR export route:**
- `app/api/account/export/route.ts:21` — `(db.from as any)(table)` bypasses typed client
- **Fix:** Replace the dynamic table loop with explicit typed queries for each table. There are a fixed set of tables to export — enumerate them rather than iterating with a cast.

**5b. Reports route:**
- `app/api/reports/route.ts:113` — `(d as unknown as { model?: string }).model` assumes filter_decisions has a model field
- **Fix:** Add `model` to the `.select()` query and extend the local type to include it. The column exists in DB but not in generated Supabase types — add a type override.

**Files:** `app/api/account/export/route.ts`, `app/api/reports/route.ts`

### Fix 6: Favicon

**Fix:** Copy the Neuridion logo from `public/neuridion-logo.svg` (or the PNG variant) and generate `app/favicon.ico`. If no suitable small icon exists, create a minimal 32x32 favicon from the "N" mark.

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

**Files:** `lib/i18n.ts`, plus 4 page files in `app/dashboard/`

### Fix 9: Billing plan display

**Root cause:** Billing page uses session client (`createClient()`). When `userData` is null (query fails silently due to RLS or connection error), `(userData?.plan ?? 'free')` defaults to "Free". Enterprise users set via admin override (no Stripe subscription) see incorrect plan info.

**Fix:**
1. Add error logging: `if (userDataError) console.error('[billing] user query failed:', userDataError.message)`
2. If `userData` is null, show an error state ("Unable to load plan details") instead of defaulting to free
3. Investigate RLS on `users` table — verify the `SELECT` policy allows authenticated users to read their own `plan` column. If missing, add the policy.

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
