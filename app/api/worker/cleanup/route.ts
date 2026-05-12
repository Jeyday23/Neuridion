import { createAdminClient } from '@/lib/supabase/admin'
import { safeCompare } from '@/lib/utils/auth'

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
  console.error('[lifecycle]', `cleanup triggered, cutoff=${cutoff.toISOString()}`)
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
    return { cleaned: 0, run_ids: [] }
  }
  const runsPayload = {
    status:        'error' as const,
    error_message: 'Job timed out — no completion signal received. Please retry.',
    completed_at:  now,
  }
  const [runningResult, pendingResult, queueResult] = await Promise.all([
    db.from('search_runs').update(runsPayload).in('id', stuckIds).eq('status', 'running'),
    db.from('search_runs').update(runsPayload).in('id', stuckIds).eq('status', 'pending'),
    (db as any).from('search_job_queue').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received.',
      completed_at: now,
    }).in('run_id', stuckIds).not('status', 'in', '("completed","failed")'),
  ])
  if (runningResult.error)  console.error('[cleanup] search_runs(running) update failed:', runningResult.error.message)
  if (pendingResult.error)  console.error('[cleanup] search_runs(pending) update failed:', pendingResult.error.message)
  if (queueResult.error)    console.error('[cleanup] search_job_queue update failed:', queueResult.error.message)
  console.error('[lifecycle]', `cleanup: marking ${stuckIds.length} stuck run(s) as error: ${stuckIds.join(', ')}`)
  return { cleaned: stuckIds.length, run_ids: stuckIds }
}

async function purgeLoginAttempts(): Promise<number> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('purge_old_login_attempts')
  if (error) {
    console.error('[cleanup] purge_old_login_attempts failed:', error.message)
    return 0
  }
  const deleted = typeof data === 'number' ? data : 0
  if (deleted > 0) {
    console.error('[lifecycle]', `purged ${deleted} login_attempts older than 90 days`)
  }
  return deleted
}

async function postHandler(_req: Request): Promise<Response> {
  const [result, loginAttemptsPurged] = await Promise.all([
    runCleanup(),
    purgeLoginAttempts(),
  ])
  return Response.json({ ...result, login_attempts_purged: loginAttemptsPurged })
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.ENABLE_DEV_WORKER_BYPASS === 'true') {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      return new Response('ENABLE_DEV_WORKER_BYPASS is only allowed in development/test', { status: 500 })
    }
    const secret = req.headers.get('x-worker-secret')
    if (!process.env.WORKER_API_SECRET || !secret || !safeCompare(secret, process.env.WORKER_API_SECRET)) {
      return new Response('Unauthorized', { status: 401 })
    }
    return postHandler(req)
  }
  try {
    const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
    return await verifySignatureAppRouter(postHandler)(req)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
}
