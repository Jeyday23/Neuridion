'use client'

import { useState, useCallback } from 'react'
import { useSessionTimeout } from '@/lib/session-timeout'

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false)

  const handleWarning = useCallback(() => setShowWarning(true), [])
  const handleTimeout = useCallback(() => setShowWarning(false), [])

  const { resetActivity } = useSessionTimeout(handleWarning, handleTimeout)

  const stayLoggedIn = () => {
    resetActivity()
    setShowWarning(false)
  }

  return (
    <>
      {children}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-md border border-[#E2E8F0] bg-white px-8 py-6 shadow-lg max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold text-[#0F1F3D] mb-2">
              Session expiring
            </h2>
            <p className="text-sm text-[#134E4A] mb-6">
              You&apos;ll be logged out in 60 seconds due to inactivity. Click
              below to stay logged in.
            </p>
            <button
              onClick={stayLoggedIn}
              className="w-full rounded bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] transition-colors"
            >
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </>
  )
}
