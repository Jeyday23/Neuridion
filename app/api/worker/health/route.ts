import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const db    = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('search_job_queue')
    .select('status, created_at, completed_at, started_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const byStatus: Record<string, number> = {}
  let lastActivity: string | null = null

  for (const row of data ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    const ts = row.completed_at ?? row.started_at ?? row.created_at
    if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts
  }

  return Response.json({
    window:        '24h',
    total:         data?.length ?? 0,
    by_status:     byStatus,
    last_activity: lastActivity,
  })
}
