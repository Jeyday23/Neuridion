'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/fetch'

export function DeleteProfileButton({
  profileId,
  profileName,
}: {
  profileId: string
  profileName: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const handleDelete = async () => {
    setState('loading')
    try {
      const statsRes = await apiFetch(`/api/profiles/${profileId}/stats`)
      const stats = await statsRes.json().catch(() => ({})) as { search_run_count?: number; error?: string }
      if (!statsRes.ok) throw new Error(stats.error ?? 'Failed to fetch profile stats')

      const confirmed = window.confirm(
        `Delete ${profileName}? This will permanently delete the profile and all ${stats.search_run_count ?? 0} search runs and results. This cannot be undone.`
      )
      if (!confirmed) {
        setState('idle')
        return
      }

      const res = await apiFetch(`/api/profiles/${profileId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete profile')
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
      onClick={handleDelete}
      disabled={state === 'loading'}
      className="text-xs font-medium text-zinc-400 hover:text-red-500 disabled:opacity-50 border border-zinc-200 rounded px-2.5 py-1 hover:border-red-300 transition-colors"
    >
      {state === 'loading' ? 'Deleting…' : 'Delete'}
    </button>
  )
}
