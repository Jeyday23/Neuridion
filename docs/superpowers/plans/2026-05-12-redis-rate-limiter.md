# Redis Rate Limiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory rate limiter with Upstash Redis for cross-instance persistence

**Architecture:** Single Upstash Redis client module + rewritten rateLimit() with in-memory fallback. Same function signatures — zero consumer changes.

**Tech Stack:** @upstash/ratelimit, @upstash/redis, Vitest

---

### Task 1: Install dependencies and create Upstash Redis client

**Files:**
- Create: `lib/upstash.ts`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install @upstash/ratelimit and @upstash/redis**

```bash
npm install @upstash/ratelimit @upstash/redis
```

- [ ] **Step 2: Create lib/upstash.ts**

```typescript
import { Redis } from '@upstash/redis'

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export const redis = createRedisClient()
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to upstash imports.

- [ ] **Step 4: Commit**

```bash
git add lib/upstash.ts package.json package-lock.json
git commit -m "feat: add Upstash Redis client module

Co-Authored-By: Neuridion"
```

---

### Task 2: Rewrite rateLimit() with Redis backend and in-memory fallback

**Files:**
- Modify: `lib/rate-limit.ts`

- [ ] **Step 1: Write failing test for rateLimit with in-memory fallback**

Create `__tests__/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

// Tests run without UPSTASH env vars, so they exercise the in-memory fallback
describe('rateLimit (in-memory fallback)', () => {
  it('allows requests under the limit', async () => {
    const { rateLimit } = await import('../lib/rate-limit')
    const key = `test-allow-${Date.now()}`
    const result = rateLimit(key, 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it('blocks requests over the limit', async () => {
    const { rateLimit } = await import('../lib/rate-limit')
    const key = `test-block-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 60_000)
    }
    const result = rateLimit(key, 3, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass with current implementation**

```bash
npx vitest run __tests__/rate-limit.test.ts
```

Expected: PASS (tests exercise the existing in-memory code path)

- [ ] **Step 3: Rewrite lib/rate-limit.ts**

Replace the in-memory `windows` Map and `rateLimit` function with an Upstash-backed version that falls back to in-memory when Redis is unavailable:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/upstash'
import { Ratelimit } from '@upstash/ratelimit'

const MAX_ATTEMPTS   = 5
const WINDOW_MINUTES = 15

export async function checkLoginRateLimit(ip: string): Promise<{
  allowed: boolean
  remainingAttempts: number
}> {
  const admin       = createAdminClient()
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

  const { count } = await admin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('attempted_at', windowStart)

  const attempts = count ?? 0
  return {
    allowed:           attempts < MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts),
  }
}

export async function recordLoginAttempt(
  ip: string,
  email: string,
  success: boolean,
): Promise<void> {
  const admin = createAdminClient()
  await admin.from('login_attempts').insert({ ip_address: ip, email, success })
}

// ---------------------------------------------------------------------------
// Redis-backed rate limiter with in-memory fallback
// ---------------------------------------------------------------------------

// In-memory fallback (used when UPSTASH env vars are missing)
const windows = new Map<string, number[]>()
const CLEANUP_INTERVAL = 60_000
let lastCleanup = Date.now()

function cleanupMemory(now: number, windowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, timestamps] of windows) {
    const fresh = timestamps.filter((t) => now - t < windowMs)
    if (fresh.length === 0) windows.delete(key)
    else windows.set(key, fresh)
  }
}

function rateLimitMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  cleanupMemory(now, windowMs)

  const timestamps = windows.get(key) ?? []
  const recent = timestamps.filter((t) => now - t < windowMs)

  if (recent.length >= maxRequests) {
    const oldest = recent[0]
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) }
  }

  recent.push(now)
  windows.set(key, recent)
  return { allowed: true, retryAfterMs: 0 }
}

// Redis-backed limiters cached by (maxRequests, windowMs) pair
const limiters = new Map<string, Ratelimit>()

function getRedisLimiter(maxRequests: number, windowMs: number): Ratelimit | null {
  if (!redis) return null
  const cacheKey = `${maxRequests}:${windowMs}`
  let limiter = limiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
      prefix: 'rl',
    })
    limiters.set(cacheKey, limiter)
  }
  return limiter
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const limiter = getRedisLimiter(maxRequests, windowMs)
  if (!limiter) {
    return rateLimitMemory(key, maxRequests, windowMs)
  }

  // Fire-and-forget: Upstash ratelimit.limit() is async but callers expect sync.
  // We check synchronously via the in-memory fallback AND fire the Redis check.
  // On next request, Redis state will be authoritative.
  // For true async enforcement, callers would need to await — but changing all 12
  // call sites is out of scope. The in-memory limiter still provides baseline protection.
  limiter.limit(key).catch(() => {})
  return rateLimitMemory(key, maxRequests, windowMs)
}

export function getClientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return '0.0.0.0'
}
```

Wait — the current `rateLimit()` is synchronous but `@upstash/ratelimit.limit()` is async. All 12 callers call it synchronously. We need to make it async OR use dual-write. Let me reconsider...

The cleanest approach: make `rateLimit` async and update all 12 callers (they're all in async API route handlers, so adding `await` is trivial). This gives true Redis enforcement.

Updated `rateLimit` signature:

```typescript
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number }>
```

Each caller changes from:
```typescript
const { allowed, retryAfterMs } = rateLimit(key, 10, 60_000)
```
to:
```typescript
const { allowed, retryAfterMs } = await rateLimit(key, 10, 60_000)
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run __tests__/rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: May show errors in the 12 consumer files because `rateLimit` is now async. These are fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add lib/rate-limit.ts __tests__/rate-limit.test.ts
git commit -m "feat: rewrite rateLimit() with Upstash Redis backend and in-memory fallback

Co-Authored-By: Neuridion"
```

---

### Task 3: Update all callers to await rateLimit()

**Files:**
- Modify: `app/api/search-runs/route.ts`
- Modify: `app/api/search-runs/[id]/retry/route.ts`
- Modify: `app/api/feedback/route.ts`
- Modify: `app/api/account/export/route.ts`
- Modify: `app/api/account/delete/route.ts`
- Modify: `app/api/billing/portal/route.ts`
- Modify: `app/api/billing/checkout/route.ts`
- Modify: `app/api/claim/[code]/route.ts`
- Modify: `app/api/reports/route.ts`
- Modify: `app/signup/actions.ts`
- Modify: `app/api/auth/otp/route.ts`
- Modify: `app/login/actions.ts`

- [ ] **Step 1: Add `await` to every `rateLimit()` call across all 12 files**

In each file, change:
```typescript
const { allowed, retryAfterMs } = rateLimit(...)
```
to:
```typescript
const { allowed, retryAfterMs } = await rateLimit(...)
```

All calling functions are already `async`, so this is safe.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: make all rateLimit() callers async for Redis support

Co-Authored-By: Neuridion"
```

---

### Task 4: Add env vars and verify + push

- [ ] **Step 1: Add placeholder env vars to .env.local**

Append to `.env.local`:
```
# Upstash Redis (rate limiting) — get from https://console.upstash.com
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 2: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: Clean.

- [ ] **Step 3: Verify git status is clean**

```bash
git status
```

- [ ] **Step 4: Push to origin**

```bash
git push origin main
```
