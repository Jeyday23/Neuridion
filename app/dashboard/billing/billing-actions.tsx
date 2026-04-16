'use client'

import { useState } from 'react'

type Props =
  | { mode: 'checkout'; priceId: string; label: string }
  | { mode: 'portal' }

export function BillingActions(props: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      if (props.mode === 'checkout') {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price_id: props.priceId }),
        })
        const data = await res.json() as { url?: string; error?: string }
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to start checkout')
        window.location.href = data.url
      } else {
        const res = await fetch('/api/billing/portal', { method: 'POST' })
        const data = await res.json() as { url?: string; error?: string }
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to open billing portal')
        window.location.href = data.url
      }
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  if (props.mode === 'portal') {
    return (
      <div>
        <button
          onClick={handleClick}
          disabled={loading}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Manage subscription'}
        </button>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
      >
        {loading ? 'Loading…' : props.label}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
