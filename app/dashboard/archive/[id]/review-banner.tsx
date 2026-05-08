'use client'

import { useState } from 'react'

type ReviewStatus = 'draft' | 'reviewed' | 'approved'

export function ReviewBanner({ runId, initialStatus }: { runId: string; initialStatus: ReviewStatus }) {
  const [status, setStatus]   = useState<ReviewStatus>(initialStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function transition(next: 'reviewed' | 'approved') {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/search-runs/${runId}/review`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ review_status: next }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to update review status')
      }
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'approved') {
    return (
      <div className="mb-6 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <strong>Approved</strong> — this search is ready for report generation.
      </div>
    )
  }

  if (status === 'reviewed') {
    return (
      <div className="mb-6 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center justify-between gap-4">
        <span>
          <strong>Reviewed.</strong> Awaiting approval before report generation.
        </span>
        <button
          onClick={() => transition('approved')}
          disabled={loading}
          className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Saving…' : 'Approve for Reporting'}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-4">
      <span>
        <strong>Not yet reviewed.</strong> This search must be reviewed and approved before a report can be generated.
      </span>
      <button
        onClick={() => transition('reviewed')}
        disabled={loading}
        className="shrink-0 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Saving…' : 'Mark as Reviewed'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
