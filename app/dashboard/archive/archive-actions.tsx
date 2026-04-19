'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DownloadButton({
  runId,
  format,
  label,
}: {
  runId: string
  format: 'pdf' | 'html' | 'excel'
  label: string
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/${runId}/download?format=${format}`)
      if (!res.ok) throw new Error('Failed')
      const { url, filename } = await res.json() as { url: string; filename: string }
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      alert('Download failed — try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs text-blue-600 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Loading…' : label}
    </button>
  )
}

export function GenerateReportButton({ runId }: { runId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const handleClick = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setState('error')
    }
  }

  if (state === 'error') {
    return <span className="text-xs text-red-500">Failed — try again</span>
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="text-xs text-violet-600 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {state === 'loading' ? 'Generating…' : 'Generate Report'}
    </button>
  )
}
