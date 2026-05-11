import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await logAuditEvent(user?.id ?? null, 'logout', undefined, request)
  await supabase.auth.signOut({ scope: 'global' })

  const res = Response.json({ ok: true })
  res.headers.set('Set-Cookie', 'session_started_at=; Path=/; Max-Age=0')
  return res
}
