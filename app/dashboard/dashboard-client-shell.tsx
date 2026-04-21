'use client'

import { SearchProvider } from './search-context'
import { SearchStatusWidget } from './search-status-widget'

export function DashboardClientShell({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
      {children}
      <SearchStatusWidget />
    </SearchProvider>
  )
}
