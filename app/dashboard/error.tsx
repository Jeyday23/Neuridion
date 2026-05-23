'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] error boundary:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center py-24 px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-[#0F1F3D] mb-2">Something went wrong</h1>
        <p className="text-sm text-[#0F766E] mb-6">
          An unexpected error occurred while loading this page. Please try again or contact support if the problem persists.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[#0F1F3D] text-white rounded text-sm font-medium hover:bg-[#1a2d52] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
