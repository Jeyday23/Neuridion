import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadReviewInbox, OWNED_RUN_SCAN_LIMIT, type InboxItem, type InboxState } from '@/lib/review/inbox'

export const metadata = { title: 'Review inbox — Neuridion' }

const ROLE_LABELS: Record<NonNullable<InboxItem['assignment_role']>, string> = {
  primary: 'Primary reviewer',
  secondary: 'Second reviewer',
  both: 'Primary and second reviewer',
}

const STATE_LABELS: Record<InboxState, string> = {
  pending: 'Review pending',
  awaiting_approval: 'Awaiting approval',
  in_progress: 'Screening in progress',
  failed: 'Screening failed',
  approved: 'Approved',
}

const STATE_STYLES: Record<InboxState, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  awaiting_approval: 'border-blue-200 bg-blue-50 text-blue-800',
  in_progress: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  approved: 'border-green-200 bg-green-50 text-green-800',
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function period(item: InboxItem): string {
  const from = fmtDate(item.period_from)
  const to = fmtDate(item.period_to)
  return from && to ? `${from} to ${to}` : 'Not recorded'
}

function workText(item: InboxItem): string {
  switch (item.state) {
    case 'pending': {
      const open = item.open_requirements ?? 0
      const second = item.second_review_pending ?? 0
      const base = `${open} of ${item.required_records ?? open} required record${(item.required_records ?? open) === 1 ? '' : 's'} need a human disposition`
      return second > 0 ? `${base}, including ${second} awaiting independent second review` : base
    }
    case 'awaiting_approval':
      return item.review_status === 'reviewed'
        ? 'All required records are done. The run owner can approve it.'
        : 'All required records are done. The run can be marked as reviewed.'
    case 'in_progress':
      return 'Screening has not finished. Review opens when it completes.'
    case 'failed':
      return 'Screening did not finish. There are no results to review.'
    case 'approved':
      return 'Approved. No review work remains.'
  }
}

export default async function ReviewInboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const inbox = await loadReviewInbox(createAdminClient(), user.id)
  const items = inbox.data?.items ?? []
  const pendingCount = items.filter((item) => item.state === 'pending').length

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Review inbox</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Searches that need your human review: runs you were assigned to review, and your own runs with open records. AI classifications are supporting evidence. Your recorded disposition is the decision.
        </p>
      </div>

      {inbox.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          The review inbox could not be loaded. Refresh the page or contact support. Pending work is not shown while this error persists.
        </div>
      )}

      {!inbox.error && items.length === 0 && (
        <div className="rounded-md border border-[#E2E8F0] bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-zinc-800">No review work</p>
          <p className="mt-1 text-sm text-zinc-500">
            No runs are assigned to you and none of your own runs have open records.
          </p>
        </div>
      )}

      {!inbox.error && items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-zinc-600" role="status">
            {pendingCount === 0
              ? 'Nothing is waiting for a disposition.'
              : `${pendingCount} run${pendingCount === 1 ? '' : 's'} with records waiting for a disposition.`}
          </p>
          <div className="overflow-x-auto rounded-md border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Runs that need review, most urgent first</caption>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
                  <th scope="col" className="px-4 py-2.5 font-medium">Device</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Search period</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Open records</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Your role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.run_id} className="border-b border-zinc-100 align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="block font-medium text-zinc-900">{item.device_name ?? 'Unnamed device'}</span>
                      {item.manufacturer && <span className="block text-xs text-zinc-500">{item.manufacturer}</span>}
                    </th>
                    <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">{period(item)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${STATE_STYLES[item.state]}`}>
                        {STATE_LABELS[item.state]}
                      </span>
                      <p className="mt-1 max-w-xs text-xs text-zinc-600">{workText(item)}</p>
                      {item.coverage_incomplete && item.state !== 'failed' && item.state !== 'in_progress' && (
                        <p className="mt-1 max-w-xs text-xs font-medium text-amber-800">
                          Screening coverage was incomplete. At least one source did not return complete results, so this run may not include every relevant notice.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-700">
                      {item.open_requirements === null ? '—' : item.open_requirements}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-700">
                      {item.is_owner ? 'Owner' : item.assignment_role ? ROLE_LABELS[item.assignment_role] : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/archive/${item.run_id}`}
                        className="text-xs font-medium text-[#0D9488] underline-offset-2 hover:underline"
                      >
                        {item.state === 'pending' ? 'Review' : 'Open'}
                        <span className="sr-only"> run for {item.device_name ?? 'unnamed device'}, {period(item)}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inbox.data?.owned_truncated && (
            <p className="mt-3 text-xs text-zinc-500">
              Only your {OWNED_RUN_SCAN_LIMIT} most recent finished runs were checked for open records. Older runs are in the Archive.
            </p>
          )}
        </>
      )}
    </div>
  )
}
