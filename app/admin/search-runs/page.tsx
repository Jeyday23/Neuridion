import { createAdminClient } from '@/lib/supabase/admin'

type RunRow = {
  id: string
  status: string
  search_period_from: string | null
  search_period_to: string | null
  started_at: string | null
  user_email: string
  profile_name: string
  total_results: number
  relevant_count: number
}

async function getSearchRuns(): Promise<RunRow[]> {
  const admin = createAdminClient()

  // search_runs.profile_id → product_profiles.id (not "profiles" — that table doesn't exist)
  // relevant_count/total_results are stored on search_runs directly, no need to re-count
  const { data: runs, error } = await admin
    .from('search_runs')
    .select(`
      id,
      status,
      search_period_from,
      search_period_to,
      period_from,
      period_to,
      started_at,
      created_at,
      user_id,
      total_results,
      relevant_count,
      product_profiles ( device_name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  if (!runs || runs.length === 0) return []

  // Fetch user emails in one round-trip
  const userIds = [...new Set(runs.map((r) => r.user_id as string))]
  const { data: users } = await admin
    .from('users')
    .select('id, email')
    .in('id', userIds)

  const emailMap = new Map(
    (users ?? []).map((u: { id: string; email: string }) => [u.id, u.email])
  )

  return runs.map((r) => {
    const profileRaw = r.product_profiles as { device_name: string }[] | { device_name: string } | null
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
    return {
      id:                 r.id as string,
      status:             r.status as string,
      search_period_from: (r.search_period_from ?? r.period_from) as string | null,
      search_period_to:   (r.search_period_to   ?? r.period_to)   as string | null,
      started_at:         (r.started_at ?? r.created_at) as string | null,
      user_email:         emailMap.get(r.user_id as string) ?? '—',
      profile_name:       profile?.device_name ?? '—',
      total_results:      (r.total_results  as number | null) ?? 0,
      relevant_count:     (r.relevant_count as number | null) ?? 0,
    }
  })
}

const STATUS_STYLES: Record<string, string> = {
  complete:  'bg-green-100 text-green-700',
  running:   'bg-blue-100 text-blue-700',
  filtering: 'bg-blue-100 text-blue-700',
  queued:    'bg-zinc-100 text-zinc-600',
  error:     'bg-red-100 text-red-700',
}

export default async function AdminSearchRunsPage() {
  let runs: RunRow[] = []
  let loadError: string | null = null
  try {
    runs = await getSearchRuns()
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">Search Runs</h1>

      {loadError && (
        <div className="mb-4 rounded border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#DC2626]">
          <strong>Query error:</strong> {loadError}
        </div>
      )}

      <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
              <th className="px-4 py-3 font-medium text-zinc-500">User</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Profile</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Period</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Results</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Relevant</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Status</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 text-zinc-600">{r.user_email}</td>
                <td className="px-4 py-3 text-zinc-900">{r.profile_name}</td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                  {r.search_period_from ?? '—'} → {r.search_period_to ?? '—'}
                </td>
                <td className="px-4 py-3 text-zinc-900">{r.total_results}</td>
                <td className="px-4 py-3 text-zinc-900">{r.relevant_count}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      STATUS_STYLES[r.status] ?? 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                  {r.started_at ? new Date(r.started_at).toLocaleDateString('en-GB') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && !loadError && (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">No search runs found.</p>
        )}
      </div>
    </div>
  )
}
