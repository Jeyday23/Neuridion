import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AdminUser = {
  id: string
  email: string
  role: string
}

export async function checkIsAdmin(): Promise<AdminUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', user.id)
    .single()

  if (error || !data || data.role !== 'admin') return null

  return data as AdminUser
}
