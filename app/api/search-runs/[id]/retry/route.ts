import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { type SearchJobPayload } from '@/lib/pipeline/run-search'
import { type QStashJobMessage } from '@/app/api/worker/process-job/route'
import { Client } from '@upstash/qstash'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await params
  if (!z.string().uuid().safeParse(runId).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const supabase = await createClient()
  const db       = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`retry:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many retry requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  // Verify ownership and current status
  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('id, user_id, status, period_from, period_to, profile_id')
    .eq('id', runId)
    .eq('user_id', user.id)
    .is('deleted_at' as never, null)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'error' && run.status !== 'failed') {
    return Response.json(
      { error: `Cannot retry a run with status "${run.status}". Only failed or errored runs can be retried.` },
      { status: 409 },
    )
  }

  // Recover the original payload so selected_dbs and force_refresh are preserved
  const { data: existingJob } = await db
    .from('search_job_queue')
    .select('payload')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const payload: SearchJobPayload = (existingJob?.payload as SearchJobPayload | null) ?? {
    profile_id:    run.profile_id,
    period_from:   run.period_from,
    period_to:     run.period_to,
    selected_dbs:  ['bfarm'],
    user_id:       user.id,
    force_refresh: false,
  }
  // Ensure the re-queued job is attributed to the requesting user
  payload.user_id = user.id

  // Create a new search run instead of mutating the old one.
  // filter_decisions is append-only (trigger blocks DELETE), so the old run's
  // decisions stay intact as a historical record. A retry is semantically a
  // new run — the old run is marked superseded.
  const { data: newRun, error: newRunError } = await db
    .from('search_runs')
    .insert({
      profile_id:  run.profile_id,
      user_id:     user.id,
      period_from: run.period_from,
      period_to:   run.period_to,
      status:      'pending',
    })
    .select('id')
    .single()

  if (newRunError || !newRun) {
    console.error('[retry] Failed to create new run:', newRunError?.message)
    return Response.json({ error: 'Failed to create retry run' }, { status: 500 })
  }

  const newRunId = newRun.id

  // Mark the original run as superseded
  await db.from('search_runs').update({
    status: 'superseded',
    error_message: `Retried as run ${newRunId}`,
  }).eq('id', runId)

  // Point the payload at the new run
  payload.user_id = user.id

  // Insert a fresh job row for the new run
  const { data: newJob, error: queueError } = await db
    .from('search_job_queue')
    .insert({ run_id: newRunId, payload: payload as unknown as import('@/types/supabase').Json })
    .select('id')
    .single()

  if (queueError || !newJob) {
    await db.from('search_runs').update({ status: 'error' }).eq('id', newRunId)
    return Response.json({ error: 'Failed to create retry job record' }, { status: 500 })
  }

  // Publish to QStash
  const message: QStashJobMessage = {
    run_id: newRunId,
    job_id: newJob.id,
    ...payload,
  }
  if (!process.env.QSTASH_TOKEN || !process.env.NEXT_PUBLIC_SITE_URL) {
    await db.from('search_job_queue').delete().eq('id', newJob.id)
    await db.from('search_runs').update({ status: 'error' }).eq('id', newRunId)
    return Response.json({ error: 'Job queue not configured' }, { status: 503 })
  }

  try {
    const qstash = new Client({ token: process.env.QSTASH_TOKEN })
    await qstash.publishJSON({
      url:     `${process.env.NEXT_PUBLIC_SITE_URL}/api/worker/process-job`,
      body:    message,
      retries: 3,
      timeout: 900,
    })
  } catch (err) {
    console.error('[retry] QStash publish failed:', err instanceof Error ? err.message : String(err))
    await db.from('search_job_queue').delete().eq('id', newJob.id)
    await db.from('search_runs').update({ status: 'error' }).eq('id', newRunId)
    return Response.json({ error: 'Failed to enqueue retry job' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'search_run_retried', { original_run_id: runId, new_run_id: newRunId, original_status: run.status }, _request)

  return Response.json({ run_id: newRunId, retried_from: runId, status: 'pending' }, { status: 200 })
}
