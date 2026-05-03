import { createAdminClient } from '@/lib/supabase/admin'

async function getStats() {
  const admin = createAdminClient()
  const now   = new Date()
  const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

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

  // Trial stats — table may not exist yet; handle gracefully
  let codesIssuedMonth = 0
  let codesRedeemedMonth = 0
  let activeTrials = 0
  let trialsConverted = 0
  try {
    const [
      { count: issued },
      { count: redeemed },
      { count: active },
    ] = await Promise.all([
      admin.from('trial_codes').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
      admin.from('trial_codes').select('*', { count: 'exact', head: true }).gte('redeemed_at', monthAgo),
      admin.from('users').select('*', { count: 'exact', head: true }).eq('plan', 'trial'),
    ])
    codesIssuedMonth   = issued   ?? 0
    codesRedeemedMonth = redeemed ?? 0
    activeTrials       = active   ?? 0

    // Converted = redeemed codes where the user is now on a paid plan
    const { data: redeemedCodes } = await admin
      .from('trial_codes')
      .select('redeemed_by_user_id')
      .not('redeemed_by_user_id', 'is', null)
    const userIds = (redeemedCodes ?? [])
      .map((r: { redeemed_by_user_id: string | null }) => r.redeemed_by_user_id)
      .filter(Boolean) as string[]
    if (userIds.length > 0) {
      const { count } = await admin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('id', userIds)
        .not('plan', 'in', '("free","trial")')
      trialsConverted = count ?? 0
    }
  } catch {
    // trial_codes table doesn't exist yet — migration pending
  }

  return {
    totalUsers:         totalUsers         ?? 0,
    newSignups:         newSignups         ?? 0,
    totalRuns:          totalRuns          ?? 0,
    totalFsn:           totalFsn           ?? 0,
    codesIssuedMonth,
    codesRedeemedMonth,
    activeTrials,
    trialsConverted,
  }
}

export default async function AdminOverviewPage() {
  const stats = await getStats()

  const cards = [
    { label: 'Total users',             value: stats.totalUsers         },
    { label: 'New signups this week',    value: stats.newSignups         },
    { label: 'Total search runs',        value: stats.totalRuns          },
    { label: 'Total FSN results found',  value: stats.totalFsn           },
    { label: 'Trial codes issued (mo)',  value: stats.codesIssuedMonth   },
    { label: 'Trial codes redeemed (mo)', value: stats.codesRedeemedMonth },
    { label: 'Active trial accounts',   value: stats.activeTrials       },
    { label: 'Trials → paid',           value: stats.trialsConverted    },
  ]

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">Overview</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-md border border-[#E2E8F0] bg-white px-6 py-5"
          >
            <p className="text-sm text-zinc-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
