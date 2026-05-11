import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'

const CookieConsentSchema = z.object({
  accepted: z.boolean().optional(),
}).strict()

export async function POST(request: Request) {
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // empty body is acceptable — default to consent granted
  }

  const parsed = CookieConsentSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

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
