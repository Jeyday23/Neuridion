# OWASP Health Check Fixes — Design Spec

**Date:** 2026-05-15
**Source:** Shannon entropy scan + OWASP Top 10:2025 audit
**Scope:** 4 fixes (item #1 from audit already implemented in proxy.ts)

---

## Fix 1: Promote CSP from Report-Only to Enforced

**File:** `next.config.ts:29`
**Problem:** The `Content-Security-Policy-Report-Only` header logs violations but does not block them. The nonce-based CSP in `proxy.ts:145` is already enforced for page requests, but the static header in `next.config.ts` covers all routes (including API responses) and is still report-only.
**Change:** Rename the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.
**Risk:** Low. The CSP directives already include all legitimate origins (Stripe, Supabase, Anthropic, FDA, Swissmedic, GOV.UK, BfArM). `'unsafe-inline'` is allowed for scripts and styles, which is permissive enough for Next.js hydration.

---

## Fix 2: Security Event Alerting

**File:** `lib/audit.ts` (extend existing)
**Problem:** Security events are written to the database only. No real-time alerting for suspicious patterns.
**Change:** Add a `checkSecurityAlert()` helper called after `logAuditEvent()` for specific event types. When thresholds are exceeded, send an email via Resend to `info@neuridion.eu`. Alert triggers:
- `login_failed` events: >10 from same IP in 15 minutes
- `admin_role_change`: any occurrence
- `account_deletion`: any occurrence
- `gdpr_data_export`: any occurrence

Implementation:
- Use the existing `rateLimit()` function from `lib/rate-limit.ts` to track event counts per IP/type window
- Call Resend API directly (already in `lib/email.ts`) for the alert email
- Gate behind `SECURITY_ALERT_EMAIL` env var — if not set, skip alerting silently
- Keep it lightweight: no new tables, no new dependencies

---

## Fix 3: Fix OTP Code Length Validation

**File:** `app/api/auth/otp/route.ts:16`
**Problem:** Zod validates `z.string().length(8)` but Supabase Auth default OTP codes are 6 digits. Legitimate 6-digit codes are rejected with a 400 before ever reaching Supabase.
**Change:** Replace `z.string().length(8)` with `z.string().min(6).max(8)` to accept both 6-digit (Supabase default) and 8-character codes (if configured).

---

## Fix 4: Separate HTML Escaping from LLM Input Sanitization

**File:** `lib/scrapers/sanitize.ts`
**Problem:** `sanitizeContent()` applies HTML escaping (`&amp;`, `&lt;`, etc.) before sending text to the LLM. HTML entities in prompts can confuse the model's text understanding — the LLM sees `&amp;` instead of `&`.
**Change:** Create `sanitizeForLlm()` that does everything `sanitizeContent()` does except the HTML escaping step. Update `lib/claude/filter-pipeline.ts` to call `sanitizeForLlm()` instead of `sanitizeContent()`. Keep `sanitizeContent()` unchanged for HTML output contexts (report generation).

New exports from `sanitize.ts`:
- `escapeHtml()` — unchanged
- `sanitizeContent()` — unchanged (includes HTML escaping, for HTML contexts)
- `sanitizeForLlm()` — new (strips invisible chars, neutralizes FSN boundaries, truncates, no HTML escaping)

Update in `filter-pipeline.ts`: replace `sanitizeContent(...)` calls with `sanitizeForLlm(...)`.

---

## Out of Scope

- **Middleware.ts creation** — already exists as `proxy.ts` with full auth enforcement, session management, admin checks, and nonce-based CSP injection
- **Supabase Management API token rotation** — operational task for Jeremiah, not a code change
- **Stale worktree cleanup** — operational task, not a code change
