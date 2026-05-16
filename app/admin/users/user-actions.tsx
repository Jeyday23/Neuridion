'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiFetch } from '@/lib/fetch'

export function UserActions({
  userId,
  isAdmin,
}: {
  userId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function makeAdmin() {
    if (!confirm('Make this user an admin?')) return
    setBusy(true)
    await apiFetch(`/api/admin/users/${userId}/make-admin`, { method: 'POST' })
    setBusy(false)
    router.refresh()
  }

  async function deleteUser() {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return
    setBusy(true)
    await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      {!isAdmin && (
        <button
          onClick={makeAdmin}
          disabled={busy}
          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
        >
          Make admin
        </button>
      )}
      <button
        onClick={deleteUser}
        disabled={busy}
        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        Delete
      </button>
    </div>
  )
}
