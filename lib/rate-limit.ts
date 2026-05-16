import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/upstash'
import { Ratelimit } from '@upstash/ratelimit'

const MAX_ATTEMPTS   = 5
const WINDOW_MINUTES = 15

function anonymizeIp(ip: string): string {
  if (ip.includes(':')) return ip.replace(/:[^:]*$/, ':0')
  return ip.replace(/\.\d+$/, '.0')
}

export async function checkLoginRateLimit(ip: string): Promise<{
  allowed: boolean
  remainingAttempts: number
}> {
  const MINIMUM_RESPONSE_MS = 200
  const start = Date.now()

  // Use the FULL IP for rate limiting (ephemeral Redis/memory counter — not persisted, no GDPR concern).
  // The anonymized IP is only used when recording attempts to the database (see recordLoginAttempt).
  const rl = await rateLimit(`login:${ip}`, MAX_ATTEMPTS, WINDOW_MINUTES * 60 * 1000)
  const result = {
    allowed:           rl.allowed,
    remainingAttempts: rl.allowed ? MAX_ATTEMPTS - 1 : 0,
  }

  // Constant-time floor: prevent timing side-channels that reveal valid vs invalid emails.
  const elapsed = Date.now() - start
  if (elapsed < MINIMUM_RESPONSE_MS) {
    await new Promise(resolve => setTimeout(resolve, MINIMUM_RESPONSE_MS - elapsed))
  }

  return result
}

export async function recordLoginAttempt(
  ip: string,
  email: string,
  success: boolean,
): Promise<void> {
  if (success) return
  const admin = createAdminClient()
  const anonIp = anonymizeIp(ip)
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
  await admin.from('login_attempts').insert({ ip_address: anonIp, email: emailHash, success: false })
}

// ---------------------------------------------------------------------------
// Redis-backed rate limiter with in-memory fallback
// ---------------------------------------------------------------------------

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

export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const limiter = getRedisLimiter(maxRequests, windowMs)
  if (!limiter) {
    if (process.env.NODE_ENV === 'production' && !redis) {
      console.error('[rate-limit] Redis not configured in production — rate limiting ineffective')
    }
    return rateLimitMemory(key, maxRequests, windowMs)
  }

  try {
    const result = await limiter.limit(key)
    if (!result.success) {
      const retryAfterMs = result.reset ? result.reset - Date.now() : windowMs
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) }
    }
    return { allowed: true, retryAfterMs: 0 }
  } catch (err) {
    console.error('[rate-limit] Redis error, falling back to in-memory:', err instanceof Error ? err.message : err)
    return rateLimitMemory(key, maxRequests, windowMs)
  }
}

// ---------------------------------------------------------------------------
// Composite rate limiter: checks BOTH user-level AND IP-level limits.
// The IP-level limit is 3x the user limit to catch distributed abuse from a
// single IP across multiple accounts without being too strict for shared IPs.
// ---------------------------------------------------------------------------
const IP_LIMIT_MULTIPLIER = 3

export async function rateLimitWithIp(
  key: string,
  maxRequests: number,
  windowMs: number,
  ip: string,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const [userResult, ipResult] = await Promise.all([
    rateLimit(key, maxRequests, windowMs),
    rateLimit(`ip:${ip}`, maxRequests * IP_LIMIT_MULTIPLIER, windowMs),
  ])

  if (!userResult.allowed) return userResult
  if (!ipResult.allowed) return ipResult
  return { allowed: true, retryAfterMs: 0 }
}

// Render sets x-real-ip from the actual client connection. x-forwarded-for is
// user-spoofable unless the reverse proxy strips it — treat as fallback only.
export function getClientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return '127.0.0.1'
}
