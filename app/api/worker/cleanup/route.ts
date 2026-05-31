import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeCompare } from '@/lib/utils/auth'
import { logAuditEvent } from '@/lib/audit'

const STUCK_THRESHOLD_MINUTES = 30

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

async function runCleanup(): Promise<{ cleaned: number }> {
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
    return { cleaned: 0 }
  }
  const runsPayload = {
    status:        'error' as const,
    error_message: 'Job timed out — no completion signal received. Please retry.',
    completed_at:  now,
  }
  const [runningResult, pendingResult, queueResult] = await Promise.all([
    db.from('search_runs').update(runsPayload).in('id', stuckIds).eq('status', 'running'),
    db.from('search_runs').update(runsPayload).in('id', stuckIds).eq('status', 'pending'),
    db.from('search_job_queue').update({
      status:       'failed',
      error:        'Job timed out — no completion signal received.',
      completed_at: now,
    }).in('run_id', stuckIds).not('status', 'in', '("completed","failed")'),
  ])
  if (runningResult.error)  console.error('[cleanup] search_runs(running) update failed:', runningResult.error.message)
  if (pendingResult.error)  console.error('[cleanup] search_runs(pending) update failed:', pendingResult.error.message)
  if (queueResult.error)    console.error('[cleanup] search_job_queue update failed:', queueResult.error.message)
  console.error('[lifecycle]', `cleanup: marked ${stuckIds.length} stuck run(s) as error`)
  return { cleaned: stuckIds.length }
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

async function processExpiredDeletions(): Promise<number> {
  const db = createAdminClient()
  const now = new Date().toISOString()

  // Find users whose grace period has expired but haven't been purged yet.
  // gdpr_purge_user_data sets full_name to 'Deleted User' — use that as the purge marker.
  const { data: users, error } = await db
    .from('users')
    .select('id')
    .not('deletion_requested_at', 'is', null)
    .lte('deleted_at', now)
    .neq('full_name', 'Deleted User')
    .limit(10)

  if (error || !users || users.length === 0) return 0

  let processed = 0
  for (const user of users) {
    try {
      await db.rpc('gdpr_purge_user_data', { target_user_id: user.id })

      const { data: profiles } = await db.from('product_profiles').select('id').eq('user_id', user.id)
      const profileIds = (profiles ?? []).map((p) => p.id)
      if (profileIds.length > 0) {
        const ifuResults = await Promise.all(
          profileIds.map((pid) => db.storage.from('ifu-documents').list(pid))
        )
        const ifuPaths = ifuResults.flatMap((r, i) =>
          (r.data ?? []).map((f) => `${profileIds[i]}/${f.name}`)
        )
        if (ifuPaths.length > 0) await db.storage.from('ifu-documents').remove(ifuPaths)
      }

      const { data: attachFiles } = await db.storage.from('search-attachments').list(user.id)
      if (attachFiles && attachFiles.length > 0) {
        await db.storage.from('search-attachments').remove(attachFiles.map((f) => `${user.id}/${f.name}`))
      }

      const emailHash = createHash('sha256').update(user.id).digest('hex').slice(0, 32)
      await db.from('login_attempts').delete().eq('email', emailHash)

      const { error: authErr } = await db.auth.admin.deleteUser(user.id)
      if (authErr) console.error('[cleanup] auth.users deletion failed:', authErr.message)

      await logAuditEvent(user.id, 'account_deleted', {
        pii_anonymized: true, pms_records_retained: true,
        auth_user_deleted: !authErr, deferred_deletion: true,
      })
      processed++
    } catch (err) {
      console.error('[cleanup] deletion failed:', err instanceof Error ? err.message : String(err))
    }
  }
  return processed
}

async function postHandler(_req: Request): Promise<Response> {
  const [result, loginAttemptsPurged, deletionsProcessed] = await Promise.all([
    runCleanup(),
    purgeLoginAttempts(),
    processExpiredDeletions(),
  ])
  return Response.json({ ...result, login_attempts_purged: loginAttemptsPurged, deletions_processed: deletionsProcessed })
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.ENABLE_DEV_WORKER_BYPASS === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] ENABLE_DEV_WORKER_BYPASS is set in production — ignoring')
      // Fall through to normal QStash verification
    } else if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      return new Response('ENABLE_DEV_WORKER_BYPASS is only allowed in development/test', { status: 500 })
    } else {
      const secret = req.headers.get('x-worker-secret')
      if (!process.env.WORKER_API_SECRET || !secret || !safeCompare(secret, process.env.WORKER_API_SECRET)) {
        return new Response('Unauthorized', { status: 401 })
      }
      return postHandler(req)
    }
  }
  try {
    const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
    return await verifySignatureAppRouter(postHandler)(req)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
}
