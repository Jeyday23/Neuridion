import { SidebarNav } from './sidebar-nav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-6">
        <div className="mb-6 px-3">
          <span className="text-base font-bold tracking-tight text-zinc-900">
            Kodex
          </span>
        </div>
        <SidebarNav />
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-auto">
        {children}
      </main>
    </div>
  )
}
