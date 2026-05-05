import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'

// Runs stuck longer than this are considered dead (QStash timeout is 900s = 15 min)
const STUCK_THRESHOLD_MINUTES = 20

async function runCleanup(): Promise<{ cleaned: number; run_ids: string[] }> {
  const db     = createAdminClient()
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString()
  const now    = new Date().toISOString()

  const { data: stuckRuns } = await db
    .from('search_runs')
    .select('id')
    .eq('status', 'running')
    .lt('started_at', cutoff)

  if (!stuckRuns?.length) {
    console.log('[cleanup] no stuck runs found')
    return { cleaned: 0, run_ids: [] }
  }

  const stuckIds = stuckRuns.map((r) => r.id)

  await Promise.all([
    db.from('search_runs').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received. Please retry.',
      completed_at: now,
    }).in('id', stuckIds),
    db.from('search_job_queue').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received.',
      completed_at: now,
    }).in('run_id', stuckIds).eq('status', 'running'),
  ])

  console.log(`[cleanup] marked ${stuckIds.length} stuck run(s) as failed: ${stuckIds.join(', ')}`)
  return { cleaned: stuckIds.length, run_ids: stuckIds }
}

// POST — called by QStash hourly schedule (signature verified in production)
async function postHandler(_req: Request): Promise<Response> {
  const result = await runCleanup()
  return Response.json(result)
}

export const POST =
  process.env.NODE_ENV === 'development'
    ? postHandler
    : verifySignatureAppRouter(postHandler)

// GET — manual invocation from browser or curl (no auth, stats are non-sensitive)
export async function GET() {
  const result = await runCleanup()
  return Response.json(result)
}
