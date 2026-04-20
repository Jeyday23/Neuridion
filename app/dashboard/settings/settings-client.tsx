'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialEmail:       string
  initialFullName:    string
  initialCompanyName: string
  deletionPending:    boolean
  deletionDate:       string | null
}

export function SettingsClient({
  initialEmail,
  initialFullName,
  initialCompanyName,
  deletionPending,
  deletionDate,
}: Props) {
  const router = useRouter()

  // Account info
  const [fullName,    setFullName]    = useState(initialFullName)
  const [companyName, setCompanyName] = useState(initialCompanyName)
  const [infoMsg,     setInfoMsg]     = useState('')
  const [infoSaving,  setInfoSaving]  = useState(false)

  // Password
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [pwMsg,      setPwMsg]      = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)

  // Delete
  const [deleteConfirm,  setDeleteConfirm]  = useState('')
  const [deleteMsg,      setDeleteMsg]      = useState('')
  const [deleting,       setDeleting]       = useState(false)
  const [cancelling,     setCancelling]     = useState(false)

  // ── Account info ────────────────────────────────────────────────────────────

  const saveInfo = async () => {
    setInfoSaving(true)
    setInfoMsg('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, company_name: companyName },
    })
    setInfoMsg(error ? `Error: ${error.message}` : 'Saved.')
    setInfoSaving(false)
  }

  // ── Password ─────────────────────────────────────────────────────────────────

  const changePassword = async () => {
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match.'); return }
    if (newPw.length < 10)   { setPwMsg('Password must be at least 10 characters.'); return }
    if (!/[A-Z]/.test(newPw)) { setPwMsg('Password must contain an uppercase letter.'); return }
    if (!/[0-9]/.test(newPw)) { setPwMsg('Password must contain a number.'); return }
    if (!/[^A-Za-z0-9]/.test(newPw)) { setPwMsg('Password must contain a special character.'); return }

    setPwSaving(true)
    setPwMsg('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setPwMsg(`Error: ${error.message}`)
    } else {
      setPwMsg('Password updated.')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
    setPwSaving(false)
  }

  // ── Data export ──────────────────────────────────────────────────────────────

  const downloadData = () => {
    window.location.href = '/api/account/export'
  }

  // ── Delete account ───────────────────────────────────────────────────────────

  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteMsg('')
    const res  = await fetch('/api/account/delete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ confirmation: deleteConfirm }),
    })
    const json = await res.json()
    if (!res.ok) {
      setDeleteMsg(json.error)
    } else {
      setDeleteMsg(json.message)
      setTimeout(() => router.push('/login?deleted=1'), 2000)
    }
    setDeleting(false)
  }

  const cancelDeletion = async () => {
    setCancelling(true)
    const res  = await fetch('/api/account/delete', { method: 'DELETE' })
    const json = await res.json()
    if (res.ok) router.refresh()
    else setDeleteMsg(json.error)
    setCancelling(false)
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10">

      {/* 1. Account info */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-5">Account information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              value={initialEmail}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-400">Email cannot be changed here. Contact support.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Company name</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {infoMsg && (
            <p className={`text-sm ${infoMsg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
              {infoMsg}
            </p>
          )}
          <button
            onClick={saveInfo}
            disabled={infoSaving}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {infoSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </section>

      {/* 2. Password */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-5">Change password</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Current password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="••••••••••"
            />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
              {pwMsg}
            </p>
          )}
          <button
            onClick={changePassword}
            disabled={pwSaving || !newPw || !confirmPw}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </section>

      {/* 3. Data export */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Download my data</h2>
        <p className="text-sm text-slate-500 mb-4">
          Export all your data (profiles, search runs, reports, audit log) as a JSON file.
          This is your right under Art. 20 GDPR (data portability).
        </p>
        <button
          onClick={downloadData}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Download my data
        </button>
      </section>

      {/* 4. Delete account */}
      <section className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Delete account</h2>
        {deletionPending ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Your account is scheduled for deletion on{' '}
              <strong>{deletionDate ? new Date(deletionDate).toLocaleDateString('en-GB') : '–'}</strong>.
              You can cancel this below.
            </p>
            {deleteMsg && <p className="text-sm text-red-600">{deleteMsg}</p>}
            <button
              onClick={cancelDeletion}
              disabled={cancelling}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {cancelling ? 'Cancelling…' : 'Cancel account deletion'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This will schedule your account for permanent deletion in 30 days. Your session will
              be terminated immediately. Data retained for MDR audit trail purposes cannot be deleted.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Type <span className="font-mono bg-zinc-100 px-1 py-0.5 rounded text-xs">DELETE MY ACCOUNT</span> to confirm
              </label>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="w-full rounded-lg border border-red-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>
            {deleteMsg && <p className="text-sm text-red-600">{deleteMsg}</p>}
            <button
              onClick={deleteAccount}
              disabled={deleting || deleteConfirm !== 'DELETE MY ACCOUNT'}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? 'Processing…' : 'Delete my account'}
            </button>
          </div>
        )}
      </section>

    </div>
  )
}
