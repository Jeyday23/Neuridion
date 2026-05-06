import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'

const STUCK_THRESHOLD_MINUTES = 20

export function isStuckRun(
  run: { status: string; started_at: string | null; created_at: string },
  cutoff: Date,
): boolean {
  if (run.status === 'running') {
    const anchor = run.started_at ? new Date(run.started_at) : new Date(run.created_at)
    return anchor < cutoff
  }
  if (run.status === 'pending') {
    return new Date(run.created_at) < cutoff
  }
  return false
}

async function runCleanup(): Promise<{ cleaned: number; run_ids: string[] }> {
  const db     = createAdminClient()
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000)
  console.log(`[lifecycle] cleanup triggered, cutoff=${cutoff.toISOString()}`)
  const cutoffIso = cutoff.toISOString()
  const now       = new Date().toISOString()

  const [byStartedAt, byCreatedAt, byPending] = await Promise.all([
    db.from('search_runs').select('id').eq('status', 'running').lt('started_at', cutoffIso),
    db.from('search_runs').select('id').eq('status', 'running').is('started_at', null).lt('created_at', cutoffIso),
    db.from('search_runs').select('id').eq('status', 'pending').lt('created_at', cutoffIso),
  ])

  const stuckIds = [
    ...new Set([
      ...(byStartedAt.data ?? []).map((r) => r.id),
      ...(byCreatedAt.data ?? []).map((r) => r.id),
      ...(byPending.data   ?? []).map((r) => r.id),
    ]),
  ]

  if (stuckIds.length === 0) {
    console.log('[cleanup] no stuck runs found')
    return { cleaned: 0, run_ids: [] }
  }

  const [runsResult, queueResult] = await Promise.all([
    db.from('search_runs').update({
      status:       'error',
      error:        'Job timed out — no completion signal received. Please retry.',
      completed_at: now,
    }).in('id', stuckIds).eq('status', 'running'),
    (db as any).from('search_job_queue').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received.',
      completed_at: now,
    }).in('run_id', stuckIds).not('status', 'in', '("completed","failed")'),
  ])

  if (runsResult.error)  console.error('[cleanup] search_runs update failed:', runsResult.error.message)
  if (queueResult.error) console.error('[cleanup] search_job_queue update failed:', queueResult.error.message)

  console.log(`[lifecycle] cleanup: marking ${stuckIds.length} stuck run(s) as error: ${stuckIds.join(', ')}`)
  return { cleaned: stuckIds.length, run_ids: stuckIds }
}

async function postHandler(_req: Request): Promise<Response> {
  const result = await runCleanup()
  return Response.json(result)
}

export const POST =
  process.env.NODE_ENV === 'development'
    ? postHandler
    : (req: Request) => verifySignatureAppRouter(postHandler)(req)

export async function GET() {
  const result = await runCleanup()
  return Response.json(result)
}
