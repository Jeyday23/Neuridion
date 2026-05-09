import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const admin = createAdminClient()
    await admin
      .from('users')
      .update({ consent_cookies_at: new Date().toISOString() })
      .eq('id', user.id)
    await logAuditEvent(user.id, 'consent_granted', { consents: ['cookies'] }, request)
  }

  return Response.json({ ok: true })
}
