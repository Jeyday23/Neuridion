'use client'

import { useId, useRef, useState } from 'react'
import { apiFetch } from '@/lib/fetch'
import type { PublicAssignment } from '@/lib/review/assignments'

type AssignmentRole = PublicAssignment['assignment_role']

const ROLE_LABELS: Record<AssignmentRole, string> = {
  primary: 'Primary review',
  secondary: 'Second review',
  both: 'Primary and second review',
}

function fmtDateTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return iso
  return `${date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  })} UTC`
}

async function errorText(res: Response, fallback: string): Promise<string> {
  if (res.status === 429) return 'Too many requests. Wait a few minutes and try again.'
  const body = await res.json().catch(() => null) as { error?: unknown } | null
  // These routes return user-safe text for 4xx. Hide 5xx detail.
  if (res.status < 500 && body && typeof body.error === 'string' && body.error.trim()) return body.error
  return fallback
}

/**
 * Owner-only reviewer management. The API enforces ownership; this panel is
 * only rendered for the owner as a convenience.
 */
export function ReviewersPanel({
  runId,
  reviewStatus,
  initialAssignments,
  loadError,
}: {
  runId: string
  reviewStatus: string
  initialAssignments: PublicAssignment[]
  loadError: string | null
}) {
  const [assignments, setAssignments] = useState(initialAssignments)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignmentRole>('primary')
  const [submitting, setSubmitting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const emailId = useId()
  const roleId = useId()
  const helpId = useId()
  const locked = reviewStatus === 'approved'

  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || locked) return
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await apiFetch(`/api/search-runs/${runId}/reviewers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, assignment_role: role }),
      })
      if (!res.ok) {
        setMessage({ kind: 'error', text: await errorText(res, 'The reviewer could not be assigned. Try again.') })
        emailRef.current?.focus()
        return
      }
      const body = await res.json() as { assignment: PublicAssignment }
      setAssignments((current) => [...current, body.assignment])
      setEmail('')
      setMessage({ kind: 'success', text: `${body.assignment.reviewer_name} can now review this run.` })
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Check your connection and try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(assignment: PublicAssignment) {
    if (revokingId || locked) return
    setRevokingId(assignment.id)
    setMessage(null)
    try {
      const res = await apiFetch(
        `/api/search-runs/${runId}/reviewers?assignment_id=${encodeURIComponent(assignment.id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        setMessage({ kind: 'error', text: await errorText(res, 'The reviewer could not be removed. Try again.') })
        return
      }
      setAssignments((current) => current.filter((item) => item.id !== assignment.id))
      setConfirmRevokeId(null)
      setMessage({
        kind: 'success',
        text: `${assignment.reviewer_name} no longer has review access. Dispositions they already recorded stay in the audit trail.`,
      })
      emailRef.current?.focus()
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Check your connection and try again.' })
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <section aria-labelledby={headingId} className="mb-6 rounded-md border border-[#E2E8F0] bg-white p-5">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-900">Reviewers</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
        Assigned reviewers can open this run and record their own human dispositions. Only you can approve the run, generate reports or change reviewers.
      </p>

      {loadError && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{loadError}</p>
      )}

      {!loadError && assignments.length === 0 && (
        <p className="mt-3 text-xs text-zinc-500">No reviewers are assigned. You are reviewing this run alone.</p>
      )}

      {assignments.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100 rounded border border-zinc-100">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900">{assignment.reviewer_name}</p>
                {assignment.reviewer_email && assignment.reviewer_email !== assignment.reviewer_name && (
                  <p className="text-zinc-500">{assignment.reviewer_email}</p>
                )}
              </div>
              <span className="text-zinc-700">{ROLE_LABELS[assignment.assignment_role]}</span>
              <span className="text-zinc-500">
                Assigned {fmtDateTime(assignment.assigned_at)} by {assignment.assigned_by_name}
              </span>
              {!locked && confirmRevokeId !== assignment.id && (
                <button
                  type="button"
                  onClick={() => setConfirmRevokeId(assignment.id)}
                  className="font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
                  aria-label={`Remove ${assignment.reviewer_name} as reviewer`}
                >
                  Remove
                </button>
              )}
              {!locked && confirmRevokeId === assignment.id && (
                <span className="flex items-center gap-2" role="group" aria-label={`Confirm removing ${assignment.reviewer_name}`}>
                  <span className="text-zinc-700">Remove access? This cannot be undone for this run.</span>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(assignment)}
                    disabled={revokingId === assignment.id}
                    className="rounded border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {revokingId === assignment.id ? 'Removing…' : 'Remove'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(null)}
                    className="rounded border border-zinc-300 px-2 py-1 font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    Keep
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {locked ? (
        <p className="mt-3 text-xs text-zinc-500">This run is approved. Reviewer assignments are locked.</p>
      ) : (
        <form onSubmit={handleAssign} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" noValidate>
          <div>
            <label htmlFor={emailId} className="block text-xs font-medium text-zinc-700">Reviewer email</label>
            <input
              ref={emailRef}
              id={emailId}
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={helpId}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label htmlFor={roleId} className="block text-xs font-medium text-zinc-700">Review role</label>
            <select
              id={roleId}
              value={role}
              onChange={(event) => setRole(event.target.value as AssignmentRole)}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <option value="primary">{ROLE_LABELS.primary}</option>
              <option value="secondary">{ROLE_LABELS.secondary}</option>
              <option value="both">{ROLE_LABELS.both}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting || email.trim().length === 0}
            aria-busy={submitting}
            className="rounded-lg bg-[#0D9488] px-3 py-2 text-xs font-medium text-white hover:bg-[#0B8177] disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Assign reviewer'}
          </button>
          <p id={helpId} className="text-xs text-zinc-500 sm:col-span-3">
            The person needs an existing Neuridion account. A removed reviewer cannot be re-assigned to the same run.
          </p>
        </form>
      )}

      <div aria-live="polite" className="mt-3 text-xs">
        {message && (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={message.kind === 'error'
              ? 'rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700'
              : 'rounded border border-green-200 bg-green-50 px-3 py-2 text-green-800'}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
