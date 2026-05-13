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
    return rateLimitMemory(key, maxRequests, windowMs)
  }

  try {
    const result = await limiter.limit(key)
    if (!result.success) {
      const retryAfterMs = result.reset ? result.reset - Date.now() : windowMs
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) }
    }
    return { allowed: true, retryAfterMs: 0 }
  } catch {
    return rateLimitMemory(key, maxRequests, windowMs)
  }
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
