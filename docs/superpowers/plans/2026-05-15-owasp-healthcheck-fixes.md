# OWASP Health Check Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 security improvements identified by the OWASP Top 10:2025 audit.

**Architecture:** Four independent changes — CSP enforcement, security alerting, OTP validation fix, LLM sanitization split. Each task is self-contained and can be committed independently.

**Tech Stack:** Next.js 16, Resend (email), Zod, Supabase, Upstash Redis rate limiter.

---

### Task 1: Promote CSP from Report-Only to Enforced

**Files:**
- Modify: `next.config.ts:29`

- [ ] **Step 1: Change the header key**

In `next.config.ts`, line 29, change:

```typescript
key: 'Content-Security-Policy-Report-Only',
```

to:

```typescript
key: 'Content-Security-Policy',
```

No other changes needed — the directive values are already correct.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (this is a string change only).

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix(security): promote CSP from Report-Only to enforced

Co-Authored-By: Neuridion"
```

---

### Task 2: Fix OTP Code Length Validation

**Files:**
- Modify: `app/api/auth/otp/route.ts:16`

- [ ] **Step 1: Update the Zod schema**

In `app/api/auth/otp/route.ts`, line 16, change:

```typescript
code: z.string().length(8),
```

to:

```typescript
code: z.string().min(6).max(8),
```

This accepts Supabase's default 6-digit OTP codes as well as 8-character codes if the project has been configured for longer codes.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/otp/route.ts
git commit -m "fix(auth): accept 6-8 char OTP codes (Supabase default is 6)

Co-Authored-By: Neuridion"
```

---

### Task 3: Separate HTML Escaping from LLM Input Sanitization

**Files:**
- Modify: `lib/scrapers/sanitize.ts` — add `sanitizeForLlm()` export
- Modify: `lib/claude/filter-pipeline.ts:6,280-281,365-368` — switch import to `sanitizeForLlm`
- Modify: `lib/pipeline/stages/filter.ts:6,155` — switch import to `sanitizeForLlm`

- [ ] **Step 1: Add `sanitizeForLlm()` to sanitize.ts**

Add this new exported function after the existing `sanitizeContent()` in `lib/scrapers/sanitize.ts`:

```typescript
export function sanitizeForLlm(text: string, maxLen = 3000): string {
  if (!text) return ''
  return neutralizeFsnBoundary(
    text
      .replace(COMBINING_MARKS, '')
      .replace(FORMATTING_CONTROLS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).slice(0, maxLen)
}
```

This is identical to `sanitizeContent()` but without the `escapeHtml()` wrapper. `sanitizeContent()` stays unchanged for scraper/HTML contexts.

- [ ] **Step 2: Update filter-pipeline.ts import and calls**

In `lib/claude/filter-pipeline.ts`, line 6, change:

```typescript
import { sanitizeContent } from '@/lib/scrapers/sanitize'
```

to:

```typescript
import { sanitizeForLlm } from '@/lib/scrapers/sanitize'
```

Then replace all 7 occurrences of `sanitizeContent(` with `sanitizeForLlm(` in this file (lines 280, 281, 365, 366, 367, 368).

- [ ] **Step 3: Update pipeline/stages/filter.ts import and call**

In `lib/pipeline/stages/filter.ts`, line 6, change:

```typescript
import { sanitizeContent } from '@/lib/scrapers/sanitize'
```

to:

```typescript
import { sanitizeForLlm } from '@/lib/scrapers/sanitize'
```

Then on line 155, change `sanitizeContent(` to `sanitizeForLlm(`.

- [ ] **Step 4: Verify no other LLM-context callers remain**

Run: `grep -rn "sanitizeContent" lib/claude/ lib/pipeline/ --include="*.ts"`
Expected: Zero results. Scraper files (`lib/scrapers/*.ts`) should still use `sanitizeContent` — that is correct.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/scrapers/sanitize.ts lib/claude/filter-pipeline.ts lib/pipeline/stages/filter.ts
git commit -m "fix(ai): separate LLM sanitization from HTML escaping

sanitizeForLlm() strips invisible chars and neutralizes FSN boundaries
without HTML-encoding entities, so the model sees clean text instead of
&amp; / &lt; artifacts.

Co-Authored-By: Neuridion"
```

---

### Task 4: Add Security Event Alerting

**Files:**
- Create: `lib/security-alerts.ts`
- Modify: `lib/audit.ts:40-62` — call `checkSecurityAlert()` after insert

- [ ] **Step 1: Create `lib/security-alerts.ts`**

```typescript
import { rateLimit } from '@/lib/rate-limit'
import { escHtml } from '@/lib/utils/html'

const ALERT_EMAIL = process.env.SECURITY_ALERT_EMAIL
const RESEND_KEY  = process.env.RESEND_API_KEY

const ALERT_TRIGGERS: Record<string, { threshold: number; windowMs: number }> = {
  login:            { threshold: 10, windowMs: 15 * 60 * 1000 },
  admin_action:     { threshold: 1,  windowMs: 60 * 1000 },
  account_deleted:  { threshold: 1,  windowMs: 60 * 1000 },
  data_exported:    { threshold: 1,  windowMs: 60 * 1000 },
}

export async function checkSecurityAlert(
  eventType: string,
  eventData: Record<string, unknown> | null,
  ip: string | null,
): Promise<void> {
  if (!ALERT_EMAIL || !RESEND_KEY) return

  const trigger = ALERT_TRIGGERS[eventType]
  if (!trigger) return

  if (eventType === 'login' && eventData?.method !== undefined) {
    // Only alert on failed logins — successful logins are not suspicious
    // login events without a user_id indicate failure (user_id is null)
    return
  }

  const rateKey = `sec-alert:${eventType}:${ip ?? 'no-ip'}`
  const { allowed } = await rateLimit(rateKey, trigger.threshold, trigger.windowMs)

  // allowed=true means under threshold — no alert needed
  // allowed=false means threshold exceeded — send alert
  if (allowed) return

  const dedupKey = `sec-alert-sent:${eventType}:${ip ?? 'no-ip'}`
  const { allowed: notYetSent } = await rateLimit(dedupKey, 1, trigger.windowMs)
  if (!notYetSent) return

  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'
  const subject = `[Neuridion Security] ${eventType} alert`
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#DC2626">Security Alert</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  <p><strong>Event:</strong> ${escHtml(eventType)}</p>
  <p><strong>IP:</strong> ${escHtml(ip ?? 'unknown')}</p>
  <p><strong>Time:</strong> ${new Date().toISOString()}</p>
  <p><strong>Details:</strong> ${escHtml(JSON.stringify(eventData ?? {}))}</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px">
  <p style="font-size:12px;color:#6B7280">Automated security alert — Neuridion PMS</p>
</body></html>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: ALERT_EMAIL, subject, html }),
    })
  } catch {
    // Alert failure must never block the user action
  }
}
```

- [ ] **Step 2: Wire into `lib/audit.ts`**

Add import at top of `lib/audit.ts`:

```typescript
import { checkSecurityAlert } from '@/lib/security-alerts'
```

After the `await admin.from('audit_log').insert(...)` call (line 51-57), add:

```typescript
    const rawIpForAlert = rawIp ? anonymizeIp(rawIp) : null
    checkSecurityAlert(eventType, safeData ?? null, rawIpForAlert).catch(() => {})
```

The `.catch(() => {})` ensures alert failures are silently swallowed (same pattern as the audit try/catch).

- [ ] **Step 3: Handle failed login detection**

The current `checkSecurityAlert` skips login events that have user data (successful logins). We need to handle failed logins specifically. In `lib/security-alerts.ts`, replace the login early-return block:

```typescript
  if (eventType === 'login' && eventData?.method !== undefined) {
    return
  }
```

with:

```typescript
  // Only alert on failed logins (tracked separately via login_attempts table)
  // The audit event for successful logins includes method — skip those
  if (eventType === 'login') return
```

Then add a separate exported function for failed login alerting:

```typescript
export async function checkFailedLoginAlert(ip: string): Promise<void> {
  if (!ALERT_EMAIL || !RESEND_KEY) return

  const rateKey = `sec-alert:login-fail:${ip}`
  const { allowed } = await rateLimit(rateKey, 10, 15 * 60 * 1000)
  if (allowed) return

  const dedupKey = `sec-alert-sent:login-fail:${ip}`
  const { allowed: notYetSent } = await rateLimit(dedupKey, 1, 15 * 60 * 1000)
  if (!notYetSent) return

  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'
  const subject = '[Neuridion Security] Brute-force login attempt detected'
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#DC2626">Security Alert</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  <p><strong>Event:</strong> Brute-force login attempt</p>
  <p><strong>IP:</strong> ${escHtml(ip)}</p>
  <p><strong>Threshold:</strong> 10+ failed attempts in 15 minutes</p>
  <p><strong>Time:</strong> ${new Date().toISOString()}</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px">
  <p style="font-size:12px;color:#6B7280">Automated security alert — Neuridion PMS</p>
</body></html>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: ALERT_EMAIL, subject, html }),
    })
  } catch {
    // Silent — never block user action
  }
}
```

- [ ] **Step 4: Wire failed login alert into `app/api/auth/otp/route.ts`**

To avoid a circular dependency (`security-alerts` → `rate-limit` → `security-alerts`), call `checkFailedLoginAlert` from the OTP route handler (which already calls `recordLoginAttempt`), not from `rate-limit.ts`.

In `app/api/auth/otp/route.ts`, add import:

```typescript
import { checkFailedLoginAlert } from '@/lib/security-alerts'
```

After the `await recordLoginAttempt(ip, data.email, !error)` call on line 87 (the verify path), add:

```typescript
  if (error) {
    checkFailedLoginAlert(ip).catch(() => {})
  }
```

Similarly, after the `await recordLoginAttempt(ip, data.email, !error)` call on line 55 (the send path), add:

```typescript
  if (error) {
    checkFailedLoginAlert(ip).catch(() => {})
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/security-alerts.ts lib/audit.ts app/api/auth/otp/route.ts
git commit -m "feat(security): add real-time email alerting for suspicious events

Sends email via Resend when: >10 failed logins from same IP in 15min,
any admin action, account deletion, or data export. Gated behind
SECURITY_ALERT_EMAIL env var — silent no-op if not configured.

Co-Authored-By: Neuridion"
```

---

### Task 5: TypeScript Check + Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Verify sanitizeContent still used by scrapers**

Run: `grep -rn "sanitizeContent" lib/scrapers/ --include="*.ts"`
Expected: Multiple hits in bfarm.ts, mhra.ts, swissmedic.ts, fda-maude.ts, firecrawl.ts — all correct (these store to DB/HTML context).

- [ ] **Step 3: Verify sanitizeForLlm used by AI pipeline**

Run: `grep -rn "sanitizeForLlm\|sanitizeContent" lib/claude/ lib/pipeline/ --include="*.ts"`
Expected: Only `sanitizeForLlm` hits. Zero `sanitizeContent` hits.

- [ ] **Step 4: Verify no circular imports**

Run: `grep -rn "from.*security-alerts" lib/audit.ts app/api/auth/otp/route.ts --include="*.ts"`
Expected: Both files import from `@/lib/security-alerts`. Verify `security-alerts.ts` imports from `@/lib/rate-limit` but `rate-limit.ts` does NOT import from `security-alerts` — no circular dependency.
