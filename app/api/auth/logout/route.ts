import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  await logAuditEvent(user?.id ?? null, 'logout', undefined, request)
  await supabase.auth.signOut()

  return Response.json({ ok: true })
}
