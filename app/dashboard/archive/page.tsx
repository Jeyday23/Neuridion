import { createClient } from '@/lib/supabase/server'
import { DownloadButtons } from './download-buttons'

export const metadata = { title: 'Archive — Kodex' }

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  running:   'bg-blue-50 text-blue-700 border-blue-200',
  failed:    'bg-red-50 text-red-700 border-red-200',
  pending:   'bg-zinc-100 text-zinc-600 border-zinc-200',
}

export default async function ArchivePage() {
  const supabase = await createClient()

  const { data: runs, error } = await supabase
    .from('search_runs')
    .select(`
      id,
      status,
      period_from,
      period_to,
      error,
      created_at,
      relevant_count,
      uncertain_count,
      excluded_count,
      product_profiles ( device_name, manufacturer )
    `)
    .order('created_at', { ascending: false })

  // Fetch reports keyed by run_id
  const runIds = runs?.map((r) => r.id) ?? []
  const reportMap: Record<string, string> = {}  // run_id → report id

  if (runIds.length > 0) {
    const { data: reports } = await supabase
      .from('reports')
      .select('id, run_id')
      .in('run_id', runIds)

    for (const rep of reports ?? []) {
      reportMap[rep.run_id] = rep.id
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Archive</h1>
        <p className="mt-1 text-sm text-zinc-500">All past search runs and their results.</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error.message}
        </p>
      )}

      {!error && (!runs || runs.length === 0) && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
          <p className="text-sm font-medium text-zinc-900">No runs yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Run a search from the{' '}
            <a href="/dashboard/search" className="text-blue-600 hover:underline">Search</a>
            {' '}page to see results here.
          </p>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Profile</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Period</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Notices</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Run date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Reports</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => {
                const profileRaw = run.product_profiles
                const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
                  device_name: string; manufacturer: string
                } | null
                const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.pending
                const reportId = reportMap[run.id]

                return (
                  <tr
                    key={run.id}
                    className={i < runs.length - 1 ? 'border-b border-zinc-100' : ''}
                  >
                    <td className="px-4 py-3">
                      {profile ? (
                        <span className="font-medium text-zinc-900">{profile.device_name}</span>
                      ) : (
                        <span className="text-zinc-400 italic">Deleted profile</span>
                      )}
                      {profile && (
                        <span className="text-zinc-500 ml-1.5 text-xs">{profile.manufacturer}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                      {run.period_from} → {run.period_to}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
                        {run.status}
                      </span>
                      {run.error && (
                        <p className="mt-1 text-xs text-red-600 max-w-xs truncate" title={run.error}>
                          {run.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {run.status === 'completed' ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          {run.relevant_count > 0 && <span className="text-green-700">{run.relevant_count} relevant</span>}
                          {run.uncertain_count > 0 && <span className="text-amber-700">{run.uncertain_count} uncertain</span>}
                          {run.excluded_count > 0 && <span className="text-zinc-400">{run.excluded_count} excluded</span>}
                          {run.relevant_count === 0 && run.uncertain_count === 0 && run.excluded_count === 0 && '—'}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                      {new Date(run.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {reportId ? (
                        <DownloadButtons reportId={reportId} />
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
