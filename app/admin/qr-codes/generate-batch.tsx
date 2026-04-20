'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateBatch() {
  const router = useRouter()
  const [batchName, setBatchName]   = useState('')
  const [quantity,  setQuantity]    = useState(25)
  const [expiresAt, setExpiresAt]   = useState('')
  const [loading,   setLoading]     = useState(false)
  const [message,   setMessage]     = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!batchName.trim()) { setMessage('Batch name is required.'); return }
    setLoading(true)
    setMessage('')
    const res  = await fetch('/api/admin/trial-codes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        batch_name: batchName.trim(),
        quantity,
        expires_at: expiresAt || undefined,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      setMessage(`✓ Created ${json.created} codes for "${batchName}"`)
      setBatchName('')
      setExpiresAt('')
      router.refresh()
    } else {
      setMessage(`Error: ${json.error}`)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
      <h2 className="text-base font-semibold text-zinc-900">Generate new batch</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1.5">Batch name</label>
          <input
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="DEMA 2026"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1.5">Quantity</label>
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n} codes</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1.5">
            Expires (optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
      {message && (
        <p className={`text-sm ${message.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? 'Generating…' : 'Generate codes'}
      </button>
    </form>
  )
}
