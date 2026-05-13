# OWASP P0/P1 Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 OWASP audit findings (P0/P1) across access control, prompt injection, XSS, security headers, payment integrity, and error handling.

**Architecture:** Surgical, file-by-file fixes. No new packages, no new tables (one ALTER TABLE migration). Task ordering: C2 (sanitize.ts) before H1 (filter-pipeline.ts), H8 audit type before webhook handler. All others independent.

**Tech Stack:** Next.js 16, Supabase, Anthropic SDK, Stripe, Zod, TypeScript

---

### Task 1: FSN_DATA Boundary Neutralization (C2)

**Files:**
- Modify: `lib/scrapers/sanitize.ts`
- Test: `__tests__/unit/sanitize.test.ts` (create)

This task MUST be completed before Task 3 (H1), because Task 3 relies on `sanitizeContent()` already containing the boundary neutralization.

- [ ] **Step 1: Write failing test for boundary neutralization**

Create `__tests__/unit/sanitize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizeContent, escapeHtml } from '../../lib/scrapers/sanitize'

describe('sanitizeContent', () => {
  it('neutralizes </FSN_DATA> closing tag', () => {
    const result = sanitizeContent('Hello </FSN_DATA> world')
    expect(result).not.toContain('FSN_DATA')
    expect(result).toContain('[FSN_BOUNDARY_REMOVED]')
  })

  it('neutralizes <FSN_DATA> opening tag', () => {
    const result = sanitizeContent('Hello <FSN_DATA> world')
    expect(result).not.toContain('FSN_DATA')
  })

  it('neutralizes case-insensitive variants', () => {
    const result = sanitizeContent('test </fsn_data> test </Fsn_Data> end')
    expect(result).not.toContain('fsn_data')
    expect(result).not.toContain('Fsn_Data')
  })

  it('strips combining marks and formatting controls', () => {
    const result = sanitizeContent('te­st wo​rd')
    expect(result).toBe('test word')
  })

  it('HTML-escapes dangerous characters', () => {
    const result = sanitizeContent('<script>alert("xss")</script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('<script>')
  })

  it('truncates to maxLen', () => {
    const result = sanitizeContent('a'.repeat(5000), 100)
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('returns empty string for falsy input', () => {
    expect(sanitizeContent('')).toBe('')
  })
})

describe('escapeHtml', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
```

- [ ] **Step 2: Run test to verify the boundary tests fail**

Run: `npx vitest run __tests__/unit/sanitize.test.ts`
Expected: The FSN_DATA boundary tests FAIL (boundary strings still present). The other tests should pass since sanitizeContent already handles those cases.

- [ ] **Step 3: Add neutralizeFsnBoundary to sanitize.ts**

Open `lib/scrapers/sanitize.ts`. The current file content is:

```typescript
const COMBINING_MARKS = /[­͏ᅟ]/g
const FORMATTING_CONTROLS = /[​‌‍⁠‪‫‬‭‮﻿]/g
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
const HTML_CHARS = /[&<>"']/g

export function escapeHtml(text: string): string {
  return text.replace(HTML_CHARS, (ch) => HTML_ESCAPE_MAP[ch])
}

export function sanitizeContent(text: string, maxLen = 3000): string {
  if (!text) return ''
  return escapeHtml(
    text
      .replace(COMBINING_MARKS, '')
      .replace(FORMATTING_CONTROLS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).slice(0, maxLen)
}
```

Replace the entire file with:

```typescript
const COMBINING_MARKS = /[­͏ᅟ]/g
const FORMATTING_CONTROLS = /[​‌‍⁠‪‫‬‭‮﻿]/g
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
const HTML_CHARS = /[&<>"']/g
const FSN_BOUNDARY = /<\/?FSN_DATA>/gi

export function escapeHtml(text: string): string {
  return text.replace(HTML_CHARS, (ch) => HTML_ESCAPE_MAP[ch])
}

function neutralizeFsnBoundary(text: string): string {
  return text.replace(FSN_BOUNDARY, '[FSN_BOUNDARY_REMOVED]')
}

export function sanitizeContent(text: string, maxLen = 3000): string {
  if (!text) return ''
  return escapeHtml(
    neutralizeFsnBoundary(
      text
        .replace(COMBINING_MARKS, '')
        .replace(FORMATTING_CONTROLS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
  ).slice(0, maxLen)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/unit/sanitize.test.ts`
Expected: ALL PASS

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/scrapers/sanitize.ts __tests__/unit/sanitize.test.ts
git commit -m "fix(sanitize): neutralize FSN_DATA boundary tags in sanitizeContent

Prevents LLM prompt boundary escape via attacker-controlled FSN content.
Addresses OWASP finding C2 (LLM01 Prompt Injection).

Co-Authored-By: Neuridion"
```

---

### Task 2: Cancel Route IDOR Fix (C1)

**Files:**
- Modify: `app/api/search-runs/[id]/cancel/route.ts`

- [ ] **Step 1: Fix the IDOR — add user_id to SELECT and remove redundant check**

Open `app/api/search-runs/[id]/cancel/route.ts`. Replace lines 22-34 (from the `const { data: run` query through the `if (run.user_id !== user.id)` block):

Find this code:

```typescript
  const { data: run, error: runError } = await db
    .from('search_runs')
    .select('id, user_id, status')
    .eq('id', id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (run.user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
```

Replace with:

```typescript
  const { data: run, error: runError } = await db
    .from('search_runs')
    .select('id, user_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/search-runs/\[id\]/cancel/route.ts
git commit -m "fix(cancel): add user_id filter to prevent IDOR information disclosure

The initial SELECT now includes .eq('user_id', user.id) so unauthorized
users cannot confirm the existence of other users' run IDs.
Addresses OWASP finding C1 (A01 Broken Access Control).

Co-Authored-By: Neuridion"
```

---

### Task 3: Haiku & Sonnet Prompt Injection Fix (H1) + Auth Error Fix (Bonus)

**Files:**
- Modify: `lib/claude/filter-pipeline.ts`

This task depends on Task 1 (C2) being complete — `sanitizeContent` must already include boundary neutralization.

- [ ] **Step 1: Add sanitizeContent import**

At the top of `lib/claude/filter-pipeline.ts`, add the import. Find line 5:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
```

Add after it:

```typescript
import { sanitizeContent } from '@/lib/scrapers/sanitize'
```

- [ ] **Step 2: Fix isCreditExhaustionError to exclude 401, add isAuthError**

Replace lines 22-37 (from `function isCreditExhaustionError` through `markCreditExhausted`):

Find:

```typescript
function isCreditExhaustionError(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError)  return true   // 401
  if (err instanceof Anthropic.PermissionDeniedError) return true  // 403
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) return true
    const msg = String(err.message).toLowerCase()
    return msg.includes('credit balance') || msg.includes('insufficient_quota') || msg.includes('billing')
  }
  return false
}

function markCreditExhausted(err: unknown): void {
  creditExhausted = true
  console.error('[filter] Anthropic credit exhausted — all subsequent AI calls will skip:',
    err instanceof Error ? err.message : String(err))
}
```

Replace with:

```typescript
function isAuthError(err: unknown): boolean {
  return err instanceof Anthropic.AuthenticationError
}

function isCreditExhaustionError(err: unknown): boolean {
  if (err instanceof Anthropic.PermissionDeniedError) return true
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) return true
    const msg = String(err.message).toLowerCase()
    return msg.includes('credit balance') || msg.includes('insufficient_quota') || msg.includes('billing')
  }
  return false
}

function markCreditExhausted(err: unknown): void {
  creditExhausted = true
  console.error('[filter] Anthropic credit/billing exhausted — all subsequent AI calls will skip:',
    err instanceof Error ? err.message : String(err))
}

function markAuthFailed(err: unknown): void {
  creditExhausted = true
  console.error('[filter] Anthropic API key invalid (401) — check ANTHROPIC_API_KEY env var:',
    err instanceof Error ? err.message : String(err))
}
```

- [ ] **Step 3: Wrap Haiku prompt FSN fields with sanitizeContent**

Find line 266 inside `haikuPreFilter`:

```typescript
            `\n\n<FSN_DATA>\nFSN: "${sanitizePii(fsn.title)}" by ${sanitizePii(fsn.manufacturer || 'Unknown')}\n</FSN_DATA>\n\n` +
```

Replace with:

```typescript
            `\n\n<FSN_DATA>\nFSN: "${sanitizeContent(sanitizePii(fsn.title), 500)}" by ${sanitizeContent(sanitizePii(fsn.manufacturer || 'Unknown'), 200)}\n</FSN_DATA>\n\n` +
```

- [ ] **Step 4: Wrap Sonnet prompt FSN fields with sanitizeContent**

Find the Sonnet `<FSN_DATA>` block (lines 344-349):

```typescript
              `<FSN_DATA>\n` +
              `Title: ${sanitizePii(fsn.title)}\n` +
              `Manufacturer: ${sanitizePii(fsn.manufacturer || 'Unknown')}\n` +
              `Date: ${fsn.fsn_date || 'Unknown'}\n` +
              `Content: ${content}\n` +
              `</FSN_DATA>`,
```

Replace with:

```typescript
              `<FSN_DATA>\n` +
              `Title: ${sanitizeContent(sanitizePii(fsn.title), 500)}\n` +
              `Manufacturer: ${sanitizeContent(sanitizePii(fsn.manufacturer || 'Unknown'), 200)}\n` +
              `Date: ${fsn.fsn_date || 'Unknown'}\n` +
              `Content: ${sanitizeContent(content, 2000)}\n` +
              `</FSN_DATA>`,
```

- [ ] **Step 5: Update outer catch to handle auth errors separately**

Find lines 443-444 in `stage1Filter`:

```typescript
    if (isCreditExhaustionError(err)) markCreditExhausted(err)
    const errMsg = err instanceof Error ? err.message : String(err)
```

Replace with:

```typescript
    if (isAuthError(err)) markAuthFailed(err)
    else if (isCreditExhaustionError(err)) markCreditExhausted(err)
    const errMsg = err instanceof Error ? err.message : String(err)
```

Also find the Haiku catch block (line 414):

```typescript
      if (isCreditExhaustionError(haikuErr)) {
```

Replace with:

```typescript
      if (isAuthError(haikuErr)) {
        markAuthFailed(haikuErr)
        throw haikuErr
      }
      if (isCreditExhaustionError(haikuErr)) {
```

And remove the existing `markCreditExhausted(haikuErr)` and `throw haikuErr` lines that immediately follow, since the auth check now handles that throw. The result should be:

```typescript
      if (isAuthError(haikuErr)) {
        markAuthFailed(haikuErr)
        throw haikuErr
      }
      if (isCreditExhaustionError(haikuErr)) {
        markCreditExhausted(haikuErr)
        throw haikuErr
      }
```

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add lib/claude/filter-pipeline.ts
git commit -m "fix(filter): sanitize FSN data in LLM prompts, fix auth error logging

- Wrap Haiku and Sonnet FSN fields with sanitizeContent() to prevent
  prompt injection via attacker-controlled FSN titles (H1)
- Separate 401 auth errors from credit exhaustion — fixes misleading
  'credit exhausted' log message for invalid API keys (Bonus)

Co-Authored-By: Neuridion"
```

---

### Task 4: BfArM Detail Enrichment XSS Fix (H2)

**Files:**
- Modify: `lib/pipeline/run-search.ts:441`

- [ ] **Step 1: Add sanitizeContent import**

At the top of `lib/pipeline/run-search.ts`, find the imports. Add after the existing imports (around line 13):

```typescript
import { sanitizeContent } from '@/lib/scrapers/sanitize'
```

- [ ] **Step 2: Wrap enriched content with sanitizeContent**

Find line 441:

```typescript
          const enrichedContent = `${row.title}\n\n${detail}`
```

Replace with:

```typescript
          const enrichedContent = sanitizeContent(`${row.title}\n\n${detail}`)
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/pipeline/run-search.ts
git commit -m "fix(pipeline): sanitize BfArM detail enrichment before DB write

Wraps fetchBfarmDetail() output with sanitizeContent() to prevent
stored XSS via unsanitized detail page HTML.
Addresses OWASP finding H2 (A03 Injection).

Co-Authored-By: Neuridion"
```

---

### Task 5: CSP Header (H6)

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add CSP Report-Only header**

Open `next.config.ts`. Find the headers array (inside the `return` statement). After the last header object (`{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }`), add a new entry:

Find:

```typescript
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
```

Add after it:

```typescript
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.stripe.com https://fsca.swissmedic.ch https://api.fda.gov https://www.gov.uk https://www.bfarm.de",
              "frame-src https://js.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(security): add Content-Security-Policy in report-only mode

Deploy as Report-Only first per council mandate — Next.js hydration
scripts need validation before enforcing. Whitelists Stripe, Supabase,
Anthropic, and all 4 scraper domains.
Addresses OWASP finding H6 (A05 Security Misconfiguration).

Co-Authored-By: Neuridion"
```

---

### Task 6: Auth Middleware (H7)

**Files:**
- Create: `middleware.ts` (project root)

- [ ] **Step 1: Create middleware.ts**

Create the file `middleware.ts` at the project root (`/Users/jeremiahmatador/NEURIDION/middleware.ts`):

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/admin')

  const isApiProtected =
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/auth') &&
    !request.nextUrl.pathname.startsWith('/api/webhooks') &&
    !request.nextUrl.pathname.startsWith('/api/claim') &&
    !request.nextUrl.pathname.startsWith('/api/consent')

  if (!user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (!user && isApiProtected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/:path*'],
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(security): add centralized auth middleware

Protects /dashboard/*, /admin/*, and /api/* routes with Supabase
auth.getUser() verification. Exempt: /api/auth, /api/webhooks,
/api/claim, /api/consent. Per-route checks remain as defense-in-depth.
Addresses OWASP finding H7 (A01 Broken Access Control).

Co-Authored-By: Neuridion"
```

---

### Task 7: Stripe Webhook Audit Logging + Idempotency (H8 + H9)

**Files:**
- Modify: `lib/audit.ts:19` (add type)
- Modify: `app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Add billing_event to AuditEventType**

Open `lib/audit.ts`. Find the `AuditEventType` type union (line 19). Add `'billing_event'` to the union. Find:

```typescript
  | 'self_approval_override'
```

Add after it:

```typescript
  | 'billing_event'
```

- [ ] **Step 2: Add idempotency guard and audit logging to Stripe webhook**

Open `app/api/webhooks/stripe/route.ts`. Replace the entire file with:

```typescript
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { planFromPriceId } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import type Stripe from 'stripe'
import type { Database } from '@/types/supabase'

type UserUpdate = Database['public']['Tables']['users']['Update']

// Assumes single-process deployment (Render). Upgrade to Redis/Upstash if scaling to multiple processes.
const PROCESSED_EVENTS = new Map<string, number>()
const EVENT_TTL_MS = 5 * 60 * 1000

function cleanExpiredEvents(): void {
  const cutoff = Date.now() - EVENT_TTL_MS
  for (const [id, ts] of PROCESSED_EVENTS) {
    if (ts < cutoff) PROCESSED_EVENTS.delete(id)
    else break
  }
}

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe-webhook]', String(err))
    return Response.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  cleanExpiredEvents()
  if (PROCESSED_EVENTS.has(event.id)) {
    return Response.json({ received: true, deduplicated: true })
  }
  PROCESSED_EVENTS.set(event.id, Date.now())

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break

      const customerId = session.customer as string
      const subscriptionId = session.subscription as string
      const userId = session.metadata?.user_id

      if (!userId) {
        console.error('checkout.session.completed: missing user_id in metadata')
        break
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const priceId = subscription.items.data[0]?.price.id ?? null
      const plan = planFromPriceId(priceId)
      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()

      await supabase
        .from('users')
        .update({
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id:        priceId,
          subscription_status:    subscription.status,
          current_period_end:     periodEnd,
          plan,
        } as unknown as UserUpdate)
        .eq('id', userId)

      await logAuditEvent(userId, 'billing_event', {
        stripe_event: 'checkout.session.completed',
        stripe_event_id: event.id,
        subscription_id: subscriptionId,
        plan,
      }, request)

      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const priceId = subscription.items.data[0]?.price.id ?? null
      const plan = planFromPriceId(priceId)
      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()

      await supabase
        .from('users')
        .update({
          stripe_price_id:     priceId,
          subscription_status: subscription.status,
          current_period_end:  periodEnd,
          plan: subscription.status === 'active' || subscription.status === 'trialing' ? plan : 'free',
        } as unknown as UserUpdate)
        .eq('stripe_subscription_id' as 'id', subscription.id)

      await logAuditEvent(null, 'billing_event', {
        stripe_event: 'customer.subscription.updated',
        stripe_event_id: event.id,
        subscription_id: subscription.id,
        new_status: subscription.status,
        plan,
      }, request)

      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription

      await supabase
        .from('users')
        .update({
          stripe_price_id:        null,
          subscription_status:    'canceled',
          current_period_end:     null,
          plan:                   'free',
        } as unknown as UserUpdate)
        .eq('stripe_subscription_id' as 'id', subscription.id)

      await logAuditEvent(null, 'billing_event', {
        stripe_event: 'customer.subscription.deleted',
        stripe_event_id: event.id,
        subscription_id: subscription.id,
      }, request)

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
      if (!invoice.subscription) break

      await supabase
        .from('users')
        .update({ subscription_status: 'past_due' } as unknown as UserUpdate)
        .eq('stripe_subscription_id' as 'id', invoice.subscription)

      await logAuditEvent(null, 'billing_event', {
        stripe_event: 'invoice.payment_failed',
        stripe_event_id: event.id,
        subscription_id: invoice.subscription,
      }, request)

      break
    }

    default:
      break
  }

  return Response.json({ received: true })
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/audit.ts app/api/webhooks/stripe/route.ts
git commit -m "feat(stripe): add audit logging and idempotency guard to webhook

- Log billing_event to audit_log for all 4 Stripe event types (H8)
- TTL-based in-memory dedup prevents duplicate event processing (H9)
- 5-minute TTL with insertion-order cleanup
Addresses OWASP findings H8 (A09) and H9 (A08).

Co-Authored-By: Neuridion"
```

---

### Task 8: OTP Null Assertion Fix (H4)

**Files:**
- Modify: `app/api/auth/otp/route.ts:96-103`

- [ ] **Step 1: Replace non-null assertion with safe optional chain**

Open `app/api/auth/otp/route.ts`. Find lines 95-107:

```typescript
  await logAuditEvent(session.user?.id ?? null, 'login', { email: data.email, method: 'otp' })

  const adminClient = createAdminClient()
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', session.user!.id)
    .single()

  const redirect = userRow?.role === 'admin' ? '/admin' : '/dashboard/search'

  return NextResponse.json({ ok: true, redirect })
```

Replace with:

```typescript
  const userId = session.user?.id
  await logAuditEvent(userId ?? null, 'login', { email: data.email, method: 'otp' })

  if (!userId) {
    return NextResponse.json({ ok: true, redirect: '/dashboard/search' })
  }

  const adminClient = createAdminClient()
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  const redirect = userRow?.role === 'admin' ? '/admin' : '/dashboard/search'

  return NextResponse.json({ ok: true, redirect })
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/otp/route.ts
git commit -m "fix(otp): replace non-null assertion with safe optional chain

Prevents TypeError crash if session.user is null after OTP verification.
Falls back to default dashboard redirect instead of crashing.
Addresses OWASP finding H4 (A10 Exception Handling).

Co-Authored-By: Neuridion"
```

---

### Task 9: Stripe Checkout/Portal Error Handling (M7/M8)

**Files:**
- Modify: `app/api/billing/checkout/route.ts:80-82`
- Modify: `app/api/billing/portal/route.ts:30-35`

- [ ] **Step 1: Wrap checkout Stripe call in try/catch**

Open `app/api/billing/checkout/route.ts`. Find lines 80-82 (the last two lines before the closing `}`):

```typescript
  const session = await stripe.checkout.sessions.create(sessionParams)

  return Response.json({ url: session.url })
}
```

Replace with:

```typescript
  try {
    const session = await stripe.checkout.sessions.create(sessionParams)
    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[billing/checkout] Stripe error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unable to create checkout session. Please try again.' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Wrap portal Stripe call in try/catch**

Open `app/api/billing/portal/route.ts`. Find lines 30-35:

```typescript
  const session = await stripe.billingPortal.sessions.create({
    customer:   userData.stripe_customer_id,
    return_url: `${baseUrl}/dashboard/billing`,
  })

  return Response.json({ url: session.url })
}
```

Replace with:

```typescript
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   userData.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/billing`,
    })
    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[billing/portal] Stripe error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unable to open billing portal. Please try again.' }, { status: 502 })
  }
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/billing/checkout/route.ts app/api/billing/portal/route.ts
git commit -m "fix(billing): wrap Stripe API calls in try/catch

Returns generic 502 on Stripe failures instead of leaking error details.
Addresses OWASP findings M7/M8 (A10 Exception Handling).

Co-Authored-By: Neuridion"
```

---

### Task 10: Result Messaging — Total Scraped Count (M14)

**Files:**
- Create: `supabase/migrations/053_search_runs_scraped_counts.sql`
- Modify: `lib/pipeline/run-search.ts:485-494`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/053_search_runs_scraped_counts.sql`:

```sql
ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS total_scraped integer,
  ADD COLUMN IF NOT EXISTS pre_filter_count integer;
```

- [ ] **Step 2: Add total_scraped and pre_filter_count to the finalize update**

Open `lib/pipeline/run-search.ts`. Find the finalize update at line 485:

```typescript
  const { error: finalizeError } = await db.from('search_runs').update({
    status:              runStatus,
    error_message:       allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    progress:            null,
  }).eq('id', runId)
```

Replace with:

```typescript
  const { error: finalizeError } = await db.from('search_runs').update({
    status:              runStatus,
    error_message:       allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    total_scraped:       items.length,
    pre_filter_count:    insertedRows.length,
    progress:            null,
  }).eq('id', runId)
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/053_search_runs_scraped_counts.sql lib/pipeline/run-search.ts
git commit -m "feat(pipeline): persist total_scraped and pre_filter_count

Adds two nullable integer columns to search_runs via migration 053.
Pipeline writes total scraped items and post-manufacturer-filter count
to give users context on result filtering.
Addresses OWASP finding M14 (UX).

Co-Authored-By: Neuridion"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass (including the new sanitize tests from Task 1)

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: No uncommitted changes

- [ ] **Step 4: Review commit log**

Run: `git log --oneline -12`
Expected: 10 commits covering all 12 fixes (some tasks combine multiple fixes into one commit)

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```
