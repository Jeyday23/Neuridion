import { createAdminClient } from '@/lib/supabase/admin'
import { runSearchPipeline, type SearchJobPayload, type ProgressUpdate } from '@/lib/pipeline/run-search'
import type { Json } from '@/types/supabase'
import { z } from 'zod'
import { safeCompare } from '@/lib/utils/auth'

// Allow up to 13 minutes — long date ranges can take 10–12 min on BfArM archive
export const maxDuration = 800

const JobMessageSchema = z.object({
  run_id:      z.string().uuid(),
  job_id:      z.string().uuid(),
  profile_id:  z.string().uuid(),
  user_id:     z.string().uuid(),
  period_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  selected_dbs: z.array(z.string()).min(1),
  force_refresh: z.boolean().optional(),
})

export interface QStashJobMessage extends SearchJobPayload {
  run_id: string
  job_id: string
}

async function handler(req: Request): Promise<Response> {
  const db  = createAdminClient()
  const raw = await req.json()
  const parsed = JobMessageSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response('Invalid job payload', { status: 400 })
  }
  const msg = raw as QStashJobMessage
  const { run_id, job_id, ...jobPayload } = msg

  console.error('[process-job]', `received run_id=${run_id} job_id=${job_id}`)

  // Idempotency guard — QStash may retry if Cloudflare times out the response
  // before the pipeline finishes. If the run is no longer pending, it's already
  // being processed or has completed; return 200 to stop further retries.
  const { data: existingRun } = await db
    .from('search_runs')
    .select('status')
    .eq('id', run_id)
    .single()

  if (existingRun?.status !== 'pending') {
    console.error('[process-job]', `run_id=${run_id} status=${existingRun?.status} -- duplicate delivery, skipping`)
    return new Response('Already processed', { status: 200 })
  }

  await Promise.all([
    db.from('search_runs').update({
      status:     'running',
      started_at: new Date().toISOString(),
    }).eq('id', run_id),
    db.from('search_job_queue').update({
      status:     'running',
      started_at: new Date().toISOString(),
    }).eq('id', job_id),
  ])

  const pipelineStart = Date.now()

  try {
    await runSearchPipeline(
      run_id,
      jobPayload,
      async (update: ProgressUpdate) => {
        await Promise.all([
          db.from('search_runs').update({ progress: update as unknown as Json }).eq('id', run_id),
          db.from('search_job_queue').update({ progress: update as unknown as Json }).eq('id', job_id),
        ])
      },
    )

    const elapsed = Math.round((Date.now() - pipelineStart) / 1000)
    console.error('[process-job]', `pipeline complete run_id=${run_id} in ${elapsed}s`)

    await db.from('search_job_queue').update({
      status:       'completed',
      completed_at: new Date().toISOString(),
      progress:     null,
    }).eq('id', job_id)

    return new Response('OK', { status: 200 })
  } catch (err) {
    const elapsed = Math.round((Date.now() - pipelineStart) / 1000)
    const errMsg  = err instanceof Error ? err.message : String(err)
    console.error(`[process-job] pipeline failed run_id=${run_id} in ${elapsed}s:`, errMsg)

    await Promise.all([
      db.from('search_job_queue').update({
        status:       'failed',
        error:        errMsg,
        completed_at: new Date().toISOString(),
      }).eq('id', job_id),
      db.from('search_runs').update({
        status:        'error',
        error_message: 'The search pipeline encountered an error. Please try again or contact support if the issue persists.',
        completed_at:  new Date().toISOString(),
      }).eq('id', run_id),
    ])

    // Return 200 — error is persisted; don't let QStash retry a logical failure
    return new Response('Pipeline failed', { status: 200 })
  }
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
      return handler(req)
    }
  }
  try {
    const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
    return await verifySignatureAppRouter(handler)(req)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
}
