import { createAdminClient } from '@/lib/supabase/admin'

type RunRow = {
  id: string
  status: string
  search_period_from: string | null
  search_period_to: string | null
  started_at: string
  user_email: string
  profile_name: string
  total_results: number
  relevant_count: number
}

async function getSearchRuns(): Promise<RunRow[]> {
  const admin = createAdminClient()

  // Fetch runs with nested user and profile data
  const { data: runs, error } = await admin
    .from('search_runs')
    .select(`
      id,
      status,
      search_period_from,
      search_period_to,
      started_at,
      user_id,
      profiles ( name )
    `)
    .order('started_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  if (!runs || runs.length === 0) return []

  // Fetch user emails
  const userIds = [...new Set(runs.map((r) => r.user_id as string))]
  const { data: users } = await admin
    .from('users')
    .select('id, email')
    .in('id', userIds)

  const emailMap = new Map((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]))

  // Fetch FSN result counts per run
  const runIds = runs.map((r) => r.id as string)
  const { data: fsnCounts } = await admin
    .from('fsn_results')
    .select('run_id')
    .in('run_id', runIds)

  const totalMap = new Map<string, number>()
  for (const row of fsnCounts ?? []) {
    const rid = row.run_id as string
    totalMap.set(rid, (totalMap.get(rid) ?? 0) + 1)
  }

  // Fetch relevant filter_decisions per run
  const { data: decisions } = await admin
    .from('filter_decisions')
    .select('search_run_id, decision')
    .in('search_run_id', runIds)
    .eq('decision', 'relevant')

  const relevantMap = new Map<string, number>()
  for (const row of decisions ?? []) {
    const rid = row.search_run_id as string
    relevantMap.set(rid, (relevantMap.get(rid) ?? 0) + 1)
  }

  return runs.map((r) => {
    const profileRaw = r.profiles as { name: string }[] | { name: string } | null
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
    return {
      id:                  r.id as string,
      status:              r.status as string,
      search_period_from:  r.search_period_from as string | null,
      search_period_to:    r.search_period_to as string | null,
      started_at:          r.started_at as string,
      user_email:          emailMap.get(r.user_id as string) ?? '—',
      profile_name:        profile?.name ?? '—',
      total_results:       totalMap.get(r.id as string) ?? 0,
      relevant_count:      relevantMap.get(r.id as string) ?? 0,
    }
  })
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  running:   'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
}

export default async function AdminSearchRunsPage() {
  const runs = await getSearchRuns()

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">Search Runs</h1>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
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
                  {new Date(r.started_at).toLocaleDateString('en-GB')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">No search runs found.</p>
        )}
      </div>
    </div>
  )
}
