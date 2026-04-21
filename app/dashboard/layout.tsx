import { SidebarNav } from './sidebar-nav'
import { LanguageSelector } from './language-selector'
import { SessionGuard } from './session-guard'
import { Footer } from '@/app/components/Footer'
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
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Kodex Medical</h1>
        </div>
        <SidebarNav userRole={userRole} />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-end shrink-0">
          <LanguageSelector />
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col">
          <DashboardClientShell>
            <SessionGuard>{children}</SessionGuard>
            <Footer />
          </DashboardClientShell>
        </div>
      </main>
    </div>
  )
}
