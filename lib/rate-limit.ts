import { createAdminClient } from '@/lib/supabase/admin'

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
// General-purpose in-memory sliding-window rate limiter for API routes
// ---------------------------------------------------------------------------

const windows = new Map<string, number[]>()

const CLEANUP_INTERVAL = 60_000
let lastCleanup = Date.now()

function cleanup(now: number, windowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, timestamps] of windows) {
    const fresh = timestamps.filter((t) => now - t < windowMs)
    if (fresh.length === 0) windows.delete(key)
    else windows.set(key, fresh)
  }
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  cleanup(now, windowMs)

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

export function getClientIp(request: Request): string {
  // Prefer x-real-ip (set by trusted reverse proxy) over x-forwarded-for (client-spoofable)
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return '0.0.0.0'
}
