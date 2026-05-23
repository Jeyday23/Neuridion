import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`logout:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await logAuditEvent(user?.id ?? null, 'logout', undefined, request)
  await supabase.auth.signOut({ scope: 'global' })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session_started_at', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  return res
}
