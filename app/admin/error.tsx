'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin] error boundary:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center py-24 px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-[#0F1F3D] mb-2">Admin error</h1>
        <p className="text-sm text-[#0F766E] mb-2">
          An unexpected error occurred in the admin panel. Please try again or check server logs for details.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-400 mb-6 font-mono">Digest: {error.digest}</p>
        )}
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
