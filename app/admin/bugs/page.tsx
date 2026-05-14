import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

interface BugReport {
  id: string
  user_id: string
  category: string
  description: string
  page_url: string | null
  user_agent: string | null
  status: string
  admin_notes: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  open:        'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:    'bg-green-50 text-green-700 border-green-200',
  closed:      'bg-zinc-100 text-zinc-500 border-zinc-200',
}

const CATEGORY_LABELS: Record<string, string> = {
  bug:        'Bug',
  suggestion: 'Suggestion',
  question:   'Question',
}

export default async function AdminBugsPage() {
  const admin_user = await checkIsAdmin()
  if (!admin_user) redirect('/dashboard/search')

  const admin = createAdminClient()
  const { data } = await admin
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const reports = (data ?? []) as BugReport[]
  const openCount = reports.filter(r => r.status === 'open').length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Bug Reports</h1>
      <p className="text-zinc-500 mb-6">
        {openCount} open report{openCount !== 1 ? 's' : ''} &middot; {reports.length} total
      </p>

      {!reports.length && (
        <p className="text-zinc-400 italic">No bug reports yet.</p>
      )}

      <div className="space-y-3">
        {reports.map((r) => (
          <div key={r.id} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[r.status] ?? STATUS_COLORS.open}`}>
                  {r.status.replace('_', ' ')}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {CATEGORY_LABELS[r.category] ?? r.category}
                </span>
              </div>
              <span className="text-xs text-zinc-400">
                {new Date(r.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>

            <p className="text-sm text-zinc-800 whitespace-pre-wrap mb-2">{r.description}</p>

            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span className="font-mono">{r.user_id.slice(0, 8)}...</span>
              {r.page_url && <span>{r.page_url}</span>}
            </div>

            {r.admin_notes && (
              <div className="mt-2 pt-2 border-t border-zinc-100">
                <p className="text-xs text-zinc-500 italic">Admin: {r.admin_notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
