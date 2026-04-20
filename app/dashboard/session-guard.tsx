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
          <div className="rounded-xl border border-zinc-200 bg-white px-8 py-6 shadow-xl max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              Session expiring
            </h2>
            <p className="text-sm text-zinc-600 mb-6">
              You&apos;ll be logged out in 60 seconds due to inactivity. Click
              below to stay logged in.
            </p>
            <button
              onClick={stayLoggedIn}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </>
  )
}
