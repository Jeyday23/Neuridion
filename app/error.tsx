'use client'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-[#0F1F3D] mb-2">Something went wrong</h1>
        <p className="text-sm text-[#0F766E] mb-6">
          An unexpected error occurred. Please try again or contact support if the problem persists.
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
