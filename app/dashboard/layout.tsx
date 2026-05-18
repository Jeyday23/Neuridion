import { redirect } from 'next/navigation'
import { DashboardClientShell } from './dashboard-client-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS } from '@/lib/plans'
import type { PlanId } from '@/lib/plans'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data, error: userQueryError } = await admin
    .from('users')
    .select('role, plan')
    .eq('id', user.id)
    .single()

  if (userQueryError) console.error('[dashboard/layout]', 'query error:', userQueryError.message, userQueryError.code)
  const userRole = data?.role ?? null
  const plan = PLANS[(data?.plan as PlanId) ?? 'free'] ?? PLANS.free

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [searchCount, profileCount] = await Promise.all([
    admin.from('search_runs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', monthStart.toISOString()),
    admin.from('product_profiles').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const quota = {
    searchesUsed: searchCount.count ?? 0,
    searchesMax: plan.maxSearchRuns,
    profilesUsed: profileCount.count ?? 0,
    profilesMax: plan.maxProfiles,
  }

  return (
    <DashboardClientShell userRole={userRole} quota={quota}>
      {children}
    </DashboardClientShell>
  )
}
