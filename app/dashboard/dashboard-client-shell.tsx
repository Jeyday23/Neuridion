'use client'

import { LanguageProvider } from './language-context'
import { SearchProvider } from './search-context'
import { SearchStatusWidget } from './search-status-widget'

export function DashboardClientShell({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <SearchProvider>
        {children}
        <SearchStatusWidget />
      </SearchProvider>
    </LanguageProvider>
  )
}
