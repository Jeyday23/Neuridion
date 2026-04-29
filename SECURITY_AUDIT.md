# Security Audit — 2026-04-29

Scope: all API routes under `app/api/`, all Supabase tables and RLS policies (via migrations),
input handling, secret management, dependency vulnerabilities, XSS surface, audit logging,
GDPR posture, security headers, CORS, and webhook security.

---

## Critical (sev-1) — fix before any new customer onboards

*None identified.*

---

## High (sev-2) — fix this sprint

### H1 — Plaintext credential logged to production logs
**File:** `app/api/claim/[code]/route.ts:99`

**What's wrong:** After creating a trial-user account, the generated temp password is written to stdout via `console.log`:
```typescript
console.log(`[trial-claim] New trial user ${email} — temp password: ${tempPassword}`)
```
On Render (and any cloud platform), stdout is the application log. Anyone on the team with log access — or any connected log drain (Datadog, Papertrail, Sentry breadcrumbs, etc.) — receives the credential in plaintext.

**Attack it enables:** A team member, contractor, or log-drain recipient can impersonate any trial user immediately after sign-up by using the logged password before the user changes it.

**Rough fix effort:** XS — delete the one `console.log` line. The response body already returns `password` to the caller (the user), so the log is redundant. If you need to surface the credential for support/demo purposes, route it through Resend instead (which is already planned: the comment above the line says "replace with email when Resend is wired up").

**Note:** `app/api/account/delete/route.ts:47` also logs `user.email` with a scheduled deletion timestamp — lower severity (no credential) but worth removing in the same pass.

---

### H2 — Unauthenticated legacy Stripe checkout endpoint
**File:** `app/api/stripe/checkout/route.ts`

**What's wrong:** `POST /api/stripe/checkout` accepts `userId` from the request body with no authentication check. Any unauthenticated caller can create a real Stripe checkout session attributed to an arbitrary `userId` and email:
```typescript
const { priceId, userId, userEmail } = await req.json();
// No supabase.auth.getUser() call anywhere in this file.
```

**Blast radius (partially mitigated):** The live webhook handler (`app/api/webhooks/stripe/route.ts`) reads `session.metadata.user_id` but this legacy route writes `metadata.userId` (different key). Due to this mismatch the webhook will not update any user's subscription on payment. So an attacker cannot grant themselves or others a paid subscription for free. However, the route:
- Creates a real Stripe checkout URL pointing to your Stripe account
- Accepts any email address in `customer_email`
- Can be used to craft convincing phishing pages ("pay Kodex here") using a real `stripe.com` URL
- Generates chargeback noise if real payments are made

The authenticated equivalent (`app/api/billing/checkout/route.ts`) already exists and the UI should be using it exclusively.

**Attack it enables:** Phishing via real Stripe URLs; billing confusion; chargeback noise.

**Rough fix effort:** XS — delete the file (`app/api/stripe/checkout/route.ts`). It is superseded by `app/api/billing/checkout/route.ts`. Confirm the UI does not reference `/api/stripe/checkout` before deleting. Similarly audit `app/api/stripe/webhook/route.ts` — it verifies the signature but only `console.log`s events (no DB updates); it too appears to be orphaned by `/api/webhooks/stripe/route.ts`.

---

## Medium (sev-3) — fix next sprint

### M1 — Unvalidated `source_url` in HTML report href attribute
**File:** `app/api/reports/route.ts:183, 190`

**What's wrong:** Text content in the generated HTML report is correctly escaped via `escHtml()`, but `r.source_url` is interpolated directly into an `href` attribute without scheme validation:
```typescript
<a href="${r.source_url}" style="...">
```
`escHtml()` converts `<`, `>`, `"` etc. but does not reject `javascript:` URIs. A `javascript:` URL in `source_url` survives into the downloadable HTML report and executes on click.

**Current risk level:** Low in practice. All four scrapers construct `source_url` from hardcoded domain prefixes (`https://www.bfarm.de`, `https://www.gov.uk`, `https://api.fda.gov`, `https://swissmedic.ch`). An attacker would need to compromise a scraper or a regulator's website to inject a malicious URL. The HTML report is also only accessible to the report owner via a signed Supabase Storage URL.

**Attack it enables:** If any scraper were compromised or a new one added with a URL-validation bug, `javascript:` URLs would survive into downloadable reports and execute in the user's browser when clicked. This is a stored XSS on a document the user trusts for regulatory compliance.

**Rough fix effort:** S — add a URL allowlist or scheme check before writing `source_url` to the DB (in scrapers), or add a `sanitizeUrl` helper at render time that replaces non-`https://` URLs with `#invalid-url`.

---

### M2 — No per-user AI cost cap; no HTTP rate limiting on search-runs
**File:** `app/api/search-runs/route.ts`, `lib/claude/rate-limiter.ts`

**What's wrong:** Three layered gaps:

1. **In-memory rate limiter resets on each deploy.** `lib/claude/rate-limiter.ts` uses module-level variables (`lastSonnetAt`, `lastHaikuAt`). On Render, every deployment or worker restart resets these to zero. With multiple workers or frequent deploys, the org-level Anthropic rate limit is the only effective guard.

2. **No per-user AI call budget.** The plan limit (`maxSearchRuns`) is enforced via a read-then-check pattern (see M3), but there is no per-user daily or monthly token/call count. A `pro` user with 50 allowed search runs can trigger 50 × N AI calls (where N is the number of scraped items per run). There is no ceiling on N.

3. **No HTTP rate limiting on the route.** A user can fire requests at `/api/search-runs` as fast as their HTTP client allows. The only throttle is the plan run limit (see M3 for its race condition) and the process-level Anthropic queue (which serializes, but does not reject).

**Attack it enables:** A malicious or mistaken paid user can trigger thousands of Anthropic API calls in minutes ($$$). There is nothing preventing a `pro` user from firing 50 concurrent runs of a 3-year date range across all 4 sources.

**Rough fix effort:** M — add a `running_search_runs` count check (reject if user already has a run with `status = 'running'`); add per-user monthly AI call count to `pdf_usage`-style tracking; add a max date span validation (see M4).

---

### M3 — Plan limit check is TOCTOU-exploitable
**File:** `app/api/search-runs/route.ts:66-78`

**What's wrong:** The search run limit is enforced as: read count → check limit → insert. Two concurrent requests from the same user can both read the same count (e.g., 0 of 1), both pass the check, and both insert. For `free` and `trial` plans with `maxSearchRuns = 1` this can double the permitted run count.

**Attack it enables:** Free-tier users can exceed their run quota by firing parallel requests.

**Rough fix effort:** S — add a unique partial index `ON search_runs(user_id) WHERE status = 'running'` to enforce one in-flight run per user at the DB level; or use a `SELECT ... FOR UPDATE` advisory lock via an RPC.

---

### M4 — No date range bounds or format validation on search-runs
**File:** `app/api/search-runs/route.ts:41-54`

**What's wrong:** `period_from` and `period_to` are accepted as opaque strings with no validation:
- No ISO date format check — passing `"; DROP TABLE"` would reach the scraper as `fromDate`
- No `from < to` check
- No maximum span — a user can request `1900-01-01` to `9999-12-31`, triggering unbounded external scraping and potentially hundreds of AI calls per item × thousands of items
- No minimum span — `from === to` is accepted

Scrapers receive these values directly via `{ fromDate: period_from!, toDate: period_to! }`.

**Attack it enables:** Server-side resource exhaustion; very long-running requests that hold a Render worker; downstream abuse of regulator APIs.

**Rough fix effort:** S — add Zod validation: ISO date regex, `from < to`, max span of e.g. 5 years, min `from` of e.g. 2010-01-01.

---

### M5 — `price_id` in billing checkout accepted without allowlist
**File:** `app/api/billing/checkout/route.ts:19-21`

**What's wrong:** `price_id` is read from the request body and passed directly to `stripe.checkout.sessions.create()` without checking against a known-good list of your own price IDs:
```typescript
const { price_id } = body
if (!price_id) { return error }
// No allowlist check
line_items: [{ price: price_id, quantity: 1 }],
```

**Attack it enables:** If an attacker knows the Stripe price IDs of any other product on your Stripe account (unlikely but possible via public Stripe embeds), they could initiate a checkout for the wrong price. More practically, if someone accidentally sends a competitor's or test price ID, Stripe will try to process it. The session creation would succeed for any active price in your Stripe account.

**Rough fix effort:** S — compare `price_id` against `Object.values(PLANS).map(p => p.stripePriceId)` or a hardcoded set before creating the session.

---

### M6 — Content-Security-Policy allows `unsafe-inline` and `unsafe-eval`
**File:** `next.config.ts`

**What's wrong:**
```javascript
"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
```
Both directives effectively disable the XSS protection that CSP is designed to provide. Any inline script injected by an XSS vulnerability executes without restriction. `unsafe-eval` enables `eval()`, `Function()`, and `setTimeout(string)` — all common XSS escalation paths.

**Attack it enables:** If any stored XSS vulnerability exists (e.g., via scraped regulator content not properly escaped), the CSP provides zero containment. The `frame-ancestors 'none'` and `X-Frame-Options: DENY` are still effective for clickjacking.

**Current risk level:** Medium, not High, because no stored XSS was found in this audit (all user-visible text goes through `escHtml()` or React's default escaping).

**Rough fix effort:** L — removing `unsafe-inline` requires adding nonces to all inline `<script>` tags (Next.js has built-in support via `nonce` in `app/layout.tsx`); removing `unsafe-eval` may require auditing third-party libraries (ExcelJS, QRCode, Supabase realtime).

---

## Low / hardening — nice to have

### L1 — npm audit: 1 high, 6 moderate vulnerabilities
**What's wrong:**
- **High:** `next >=9.3.4-canary.0` → vulnerable `postcss` version. Remediation requires a Next.js upgrade that is a breaking change.
- **Moderate (6):** `uuid <14.0.0` (buffer bounds check in v3/v5/v6 with buf arg) — affects `exceljs`, `svix`, and transitively `resend`. Fix available via `npm audit fix --force` but changes exceljs from 4.x to 3.x (breaking).

**Rough fix effort:** S for moderate (evaluate breaking-change impact); M for the Next.js high (requires testing full upgrade path).

### L2 — No Dependabot or Renovate configured
**What's wrong:** No `.github/dependabot.yml` or `renovate.json` in the repository. Dependency vulnerabilities accumulate silently between manual `npm audit` runs.

**Rough fix effort:** XS — add a `.github/dependabot.yml` with weekly npm scheduling.

### L3 — Soft-delete only; no background job to execute GDPR Art. 17 erasure
**File:** `app/api/account/delete/route.ts`

**What's wrong:** Account deletion sets `deletion_requested_at` and `deleted_at` (30-day grace) and signs the user out. The `proxy.ts` middleware checks `deleted_at` and redirects to login if passed. But there is no background job that calls `admin.auth.admin.deleteUser(id)` after the grace period. The user row, all search runs, fsn_results, filter_decisions, reports, and audit log entries remain in the database indefinitely. `fsn_canonical` and `sync_coverage` rows have no user reference so are never deleted regardless.

**GDPR posture:** The right to erasure (Art. 17) requires actual deletion, not just access revocation. The current implementation schedules deletion but never executes it.

**Rough fix effort:** M — implement a daily Supabase cron function or a Render cron job that selects `users WHERE deleted_at < now()` and calls `deleteUser()` for each. Auth cascade will delete `public.users` and all cascading user data.

### L4 — No PII detection or stripping in scrapers
**What's wrong:** MHRA field safety notice narratives frequently contain identifiable patient information (age, sex, clinical history, treatment outcomes). The MHRA scraper stores the full GOV.UK Content API body verbatim in `raw_content`, which is then indexed in `fsn_canonical` and `fsn_results`. No PII detection or stripping occurs at ingestion.

**Attack it enables:** If a data breach exposes the Supabase database, or if the GDPR data export (`/api/account/export`) is requested by a user who ran a search that ingested MHRA narratives, that export contains third-party patient PII.

**Rough fix effort:** L — proper PII detection requires ML tooling or regex heuristics. A pragmatic first step is to truncate `raw_content` to the first 500 characters (before full-name/DOB patterns typically appear) or strip the "patient information" sections that MHRA structures predictably.

### L5 — `fsn_results.run_id` vs `search_run_id` column name discrepancy
**What's wrong:** Migration `002_search_runs.sql` creates the column as `search_run_id` and the RLS policy references that name. The application code (`search-runs/route.ts`, `search-runs/[id]/route.ts`, `reports/route.ts`) consistently reads/writes `run_id`. Given the system is operational, the actual DB column must be `run_id` — meaning the migration file is out of sync with the real schema, and the RLS policy `"fsn_results: select own"` may reference a nonexistent column (`search_run_id`).

**Security implication:** If `search_run_id` does not exist in the current schema, the RLS SELECT policy for `fsn_results` references an unknown column name, which in Postgres causes the policy condition to fail with an error rather than silently allow all rows. However, the admin client used for inserts bypasses RLS entirely, so inserts work. Selects via the anon client (used in `search-runs/[id]/route.ts`) would either error or return no rows.

**Rough fix effort:** S — run `\d fsn_results` against the dev DB to determine actual column name; update the migration file to match reality; verify the RLS policy column name is correct.

---

## Already correct — no action needed

- **Authentication on all routes.** Every API route calls `supabase.auth.getUser()` as its first auth step and returns 401 on failure. No unauthenticated user-data routes found (the legacy `/api/stripe/checkout` is flagged separately under H2 but handles no user data).
- **Admin role check is DB-authoritative.** `checkIsAdmin()` reads `role` from `public.users` via the admin client — it does not trust JWT claims. A user cannot elevate their role by forging a token.
- **RLS policies are correctly scoped.** Every table with user data uses `USING (auth.uid() = user_id)` or an equivalent ownership check. Internal infrastructure tables (`filter_decision_cache`, `audit_log`, `sync_coverage`, `fsn_canonical`, `trial_codes`, `used_trial_emails`, `user_feedback`, `profile_edit_history`, `pdf_usage`, `search_drafts`, `login_attempts`) all use `USING (false)` — inaccessible via anon or authenticated Supabase clients.
- **Ownership enforcement on admin-client routes.** Routes that use `createAdminClient()` (which bypasses RLS) include explicit `.eq('user_id', user.id)` or equivalent ownership filters: `account/export`, `search-drafts`, `profiles/[id]`, `reports/[id]/download`.
- **Stripe webhook signatures verified.** Both `/api/stripe/webhook` and `/api/webhooks/stripe` call `stripe.webhooks.constructEvent()` with the webhook secret before processing any event.
- **Server-only secrets.** `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PDFSHIFT_API_KEY`, `STRIPE_WEBHOOK_SECRET` are all server-only env vars. `NEXT_PUBLIC_STRIPE_PRICE_*` exposes Stripe price IDs — these are non-secret public identifiers by design.
- **No `dangerouslySetInnerHTML` anywhere.** Grepped all `app/` and `components/` — zero occurrences.
- **HTML report text content is escaped.** `escHtml()` is applied to all user-derived and scraped text fields before interpolation into the PDF/HTML report template. (URL href is not escaped — see M1.)
- **Security headers set globally.** `next.config.ts` adds `X-Frame-Options: DENY`, `Strict-Transport-Security` with preload, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP to all routes. (CSP quality critiqued under M6.)
- **No `.env` files in git history.** `git log --all -- '.env*'` returns no matches. `.gitignore` correctly excludes `.env*`.
- **`selected_dbs` input is allowlist-validated.** Line 116 of `search-runs/route.ts` filters the input against the `SCRAPERS` registry — unknown source IDs are silently dropped.
- **Audit trail covers key events.** `logAuditEvent()` is called for: `search_run`, `report_generated`, `report_downloaded`, `logout`, `account_deleted`, `data_exported`, `admin_action`, and `signup`. The `audit_log` table is service-role-only (cannot be tampered with by authenticated users) and is included in the GDPR data export.
- **No CORS wildcard.** No API route sets `Access-Control-Allow-Origin: *`. The Next.js default same-origin behavior applies.
- **CSRF protection.** Next.js App Router API routes use `same-site` cookies (Supabase SSR sets `SameSite=Lax` by default) and all state-changing endpoints require a valid Supabase session cookie, mitigating CSRF for browser-originated requests.

---

## Inconclusive — needs human judgment

### I1 — Whether `auth.uid()` is available inside `merge_coverage_for_source` RPC
**File:** `supabase/migrations/022_coverage_merge_rpc.sql`

The function is `SECURITY DEFINER` and called via `supabase.rpc()` using the service-role client (which bypasses RLS entirely). The function performs no ownership check — it operates on `sync_coverage` which is a shared infrastructure table with no `user_id` column. This is correct by design, but confirm that the Supabase service-role key is never passed to a client-side bundle (it is not, based on this audit — it only appears in `lib/supabase/admin.ts`).

### I2 — Render environment variable configuration
**What this audit can't determine:** Whether the production Render environment has all required secrets (`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PDFSHIFT_API_KEY`) set correctly, or whether any are using development/test values. The code reads them correctly; whether they're set is a deployment-configuration question.

**Resolve by:** Render dashboard → Environment → verify each secret is set and non-empty in the production service.

### I3 — Stripe webhook registration: which routes are registered?
**What this audit can't determine:** Whether both `/api/stripe/webhook` and `/api/webhooks/stripe` are registered as webhook endpoints in the Stripe dashboard. If both are registered, the old route (`/api/stripe/webhook`) receives and verifies all events but does nothing (just logs). This is harmless. If only the old route is registered, subscription updates never reach the DB.

**Resolve by:** Stripe dashboard → Developers → Webhooks → verify exactly one endpoint is registered, pointing to `/api/webhooks/stripe`.
