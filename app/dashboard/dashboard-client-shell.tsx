'use client'

import { LanguageProvider } from './language-context'
import { SearchProvider } from './search-context'
import { SearchStatusWidget } from './search-status-widget'
import { SidebarNav } from './sidebar-nav'
import { LanguageSelector } from './language-selector'
import { SessionGuard } from './session-guard'
import { Footer } from '@/app/components/Footer'
import { HelpMenu } from '@/app/components/HelpMenu'
import { ToastProvider } from '@/app/components/ui/ToastProvider'

interface Props {
  userRole: string | null
  children: React.ReactNode
}

export function DashboardClientShell({ userRole, children }: Props) {
  return (
    <LanguageProvider>
      <SearchProvider>
        <ToastProvider>
          <div className="flex h-screen bg-slate-50">
            {/* Sidebar — inside providers so translations work */}
            <aside className="w-60 bg-white border-r border-[#E2E8F0] flex flex-col shrink-0">
              <div className="p-6 border-b border-[#E2E8F0]">
                <h1 className="text-xl font-bold text-[#0F1F3D]">Neuridion</h1>
              </div>
              <SidebarNav userRole={userRole} />
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {/* Header — inside providers so language selector can write to context */}
              <div className="bg-white border-b border-[#E2E8F0] px-8 py-4 flex items-center justify-end gap-2 shrink-0">
                <HelpMenu />
                <LanguageSelector />
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col">
                <SessionGuard>{children}</SessionGuard>
                <Footer />
              </div>
            </main>
          </div>

          <SearchStatusWidget />
        </ToastProvider>
      </SearchProvider>
    </LanguageProvider>
  )
}
