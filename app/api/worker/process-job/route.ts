import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSearchPipeline, type SearchJobPayload, type ProgressUpdate } from '@/lib/pipeline/run-search'

export interface QStashJobMessage extends SearchJobPayload {
  run_id: string
  job_id: string
}

async function handler(req: Request): Promise<Response> {
  const db  = createAdminClient()
  const msg = await req.json() as QStashJobMessage
  const { run_id, job_id, ...jobPayload } = msg

  console.log(`[process-job] received run_id=${run_id} job_id=${job_id}`)

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

  console.log(`[process-job] pipeline starting run_id=${run_id}`)
  const pipelineStart = Date.now()

  try {
    await runSearchPipeline(
      run_id,
      jobPayload,
      async (update: ProgressUpdate) => {
        await Promise.all([
          db.from('search_runs').update({ progress: update }).eq('id', run_id),
          db.from('search_job_queue').update({ progress: update }).eq('id', job_id),
        ])
      },
    )

    const elapsed = Math.round((Date.now() - pipelineStart) / 1000)
    console.log(`[process-job] pipeline complete run_id=${run_id} in ${elapsed}s`)

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
        error_message: errMsg,
        completed_at:  new Date().toISOString(),
      }).eq('id', run_id),
    ])

    // Return 200 — error is persisted; don't let QStash retry a logical failure
    return new Response('Pipeline failed', { status: 200 })
  }
}

// Skip signature verification in local development
export const POST =
  process.env.NODE_ENV === 'development'
    ? handler
    : verifySignatureAppRouter(handler)
