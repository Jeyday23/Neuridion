import { createAdminClient } from '@/lib/supabase/admin'

const STUCK_MINUTES = 20

export async function GET(req: Request) {
  const secret = req.headers.get('x-worker-secret')
  if (!secret || secret !== process.env.WORKER_API_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db    = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const stuckCutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('search_runs')
    .select('id, status, started_at, created_at, completed_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const runs = data ?? []
  const byStatus: Record<string, number> = {}
  let lastActivity: string | null = null

  for (const row of runs) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    const ts = row.completed_at ?? row.started_at ?? row.created_at
    if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts
  }

  const stuckRuns = runs.filter((r) => {
    if (r.status === 'running') {
      const anchor = r.started_at ?? r.created_at
      return anchor < stuckCutoff
    }
    if (r.status === 'pending') {
      return r.created_at < stuckCutoff
    }
    return false
  })

  return Response.json({
    window:        '24h',
    total:         runs.length,
    by_status:     byStatus,
    stuck_count:   stuckRuns.length,
    stuck_run_ids: stuckRuns.map((r) => r.id),
    last_activity: lastActivity,
  })
}
