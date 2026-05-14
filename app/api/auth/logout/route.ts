import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
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
