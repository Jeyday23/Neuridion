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
