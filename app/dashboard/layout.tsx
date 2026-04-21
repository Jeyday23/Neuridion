import { DashboardClientShell } from './dashboard-client-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userRole: string | null = null
  if (user) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    userRole = data?.role ?? null
  }

  return (
    <DashboardClientShell userRole={userRole}>
      {children}
    </DashboardClientShell>
  )
}
