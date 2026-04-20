import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const admin = createAdminClient()
    await admin
      .from('users')
      .update({ consent_cookies_at: new Date().toISOString() })
      .eq('id', user.id)
  }

  return Response.json({ ok: true })
}
