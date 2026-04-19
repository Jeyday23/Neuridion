import { SidebarNav } from './sidebar-nav'
import { LanguageSelector } from './language-selector'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Kodex Medical</h1>
        </div>
        <SidebarNav />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-end shrink-0">
          <LanguageSelector />
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
