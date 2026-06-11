'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/app/components/ui/ToastProvider'
import { apiFetch } from '@/lib/fetch'
import { messageFromError } from '@/lib/ui/api-error-message'

export function CancelRunButton({
  runId,
  onCancelled,
  onToast,
}: {
  runId: string
  onCancelled: (runId: string) => void
  onToast: (message: string, type: 'success' | 'error') => void
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/search-runs/${runId}/cancel`, { method: 'POST' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        if (res.status === 429) { onToast('Too many requests — please wait a moment.', 'error'); return }
        throw new Error(json.error ?? 'Failed to cancel search')
      }
      onCancelled(runId)
      onToast('Search cancelled', 'success')
    } catch {
      onToast('Unable to cancel search — please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className="text-xs text-amber-600 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Cancelling…' : 'Cancel'}
    </button>
  )
}

export function DeleteRunButton({
  runId,
  onDeleted,
  onToast,
}: {
  runId: string
  onDeleted: (runId: string) => void
  onToast: (message: string, type: 'success' | 'error') => void
}) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Delete this search run? Results and filter decisions will be permanently removed. This cannot be undone.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const res = await apiFetch(`/api/search-runs/${runId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        if (res.status === 429) { onToast('Too many requests — please wait a moment.', 'error'); return }
        throw new Error(json.error ?? 'Failed to delete search run')
      }
      onDeleted(runId)
      onToast('Search run deleted', 'success')
    } catch {
      onToast('Unable to delete search run — please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      aria-busy={loading}
      className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Deleting…' : 'Delete'}
    </button>
  )
}


export function DownloadButton({
  runId,
  format,
  label,
}: {
  runId: string
  format: 'pdf' | 'html' | 'excel' | 'docx'
  label: string
}) {
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/reports/${runId}/download?format=${format}`)
      if (!res.ok) throw new Error('Failed')
      const { url, filename } = await res.json() as { url: string; filename: string }
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.show('Download failed — please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className="text-xs text-blue-600 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Loading…' : label}
    </button>
  )
}

export function GenerateReportButton({ runId }: { runId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const pendingRef = useRef(false)

  const handleClick = async () => {
    if (pendingRef.current) return
    pendingRef.current = true
    setLoading(true)
    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      if (!res.ok) {
        if (res.status === 429) { toast.show('Too many requests — please wait a moment.', 'error'); return }
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to generate report')
      }
      router.refresh()
    } catch (err) {
      toast.show(messageFromError(err, 'Report generation failed — please try again.'), 'error')
    } finally {
      pendingRef.current = false
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className="text-xs text-violet-600 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Generating…' : 'Generate Report'}
    </button>
  )
}
