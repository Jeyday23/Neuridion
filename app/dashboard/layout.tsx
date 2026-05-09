import { redirect } from 'next/navigation'
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

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = data?.role ?? null

  return (
    <DashboardClientShell userRole={userRole}>
      {children}
    </DashboardClientShell>
  )
}
