import { createAdminClient } from '@/lib/supabase/admin'

async function getStats() {
  const admin = createAdminClient()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalUsers },
    { count: newSignups },
    { count: totalRuns },
    { count: totalFsn },
  ] = await Promise.all([
    admin.from('users').select('*', { count: 'exact', head: true }),
    admin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    admin.from('search_runs').select('*', { count: 'exact', head: true }),
    admin.from('fsn_results').select('*', { count: 'exact', head: true }),
  ])

  return {
    totalUsers:   totalUsers  ?? 0,
    newSignups:   newSignups  ?? 0,
    totalRuns:    totalRuns   ?? 0,
    totalFsn:     totalFsn    ?? 0,
  }
}

export default async function AdminOverviewPage() {
  const stats = await getStats()

  const cards = [
    { label: 'Total users',           value: stats.totalUsers  },
    { label: 'New signups this week',  value: stats.newSignups  },
    { label: 'Total search runs',      value: stats.totalRuns   },
    { label: 'Total FSN results found', value: stats.totalFsn   },
  ]

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">Overview</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-white px-6 py-5 shadow-sm"
          >
            <p className="text-sm text-zinc-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
