import { createAdminClient } from '@/lib/supabase/admin'
import { runSearchPipeline, type SearchJobPayload, type ProgressUpdate } from '@/lib/pipeline/run-search'
import { randomUUID } from 'crypto'

const POLL_INTERVAL_MS          = 3_000
const STALE_JOB_TIMEOUT_MINUTES = 10
const STALE_JOB_SWEEP_INTERVAL_MS = 5 * 60 * 1_000   // 5 minutes

const workerId   = `worker-${randomUUID()}`
let shuttingDown = false

process.on('SIGTERM', () => {
  console.log('[worker] SIGTERM received — will stop after current job completes')
  shuttingDown = true
})
process.on('SIGINT', () => { shuttingDown = true })

async function main(): Promise<void> {
  console.log(`[worker] Starting. ID: ${workerId}`)
  const db = createAdminClient()
  let lastSweepAt = Date.now()

  // On startup, re-queue any jobs orphaned by a previous crashed instance
  const { data: requeuedCount } = await db.rpc('requeue_stale_jobs', {
    p_timeout_minutes: STALE_JOB_TIMEOUT_MINUTES,
  })
  if ((requeuedCount ?? 0) > 0) {
    console.log(`[worker] Re-queued ${requeuedCount} stale job(s)`)
  }

  while (!shuttingDown) {
    // Periodic stale-job sweep (every 5 minutes)
    if (Date.now() - lastSweepAt >= STALE_JOB_SWEEP_INTERVAL_MS) {
      const { data: swept } = await db.rpc('requeue_stale_jobs', {
        p_timeout_minutes: STALE_JOB_TIMEOUT_MINUTES,
      })
      if ((swept ?? 0) > 0) console.log(`[worker] Periodic sweep: re-queued ${swept} stale job(s)`)
      lastSweepAt = Date.now()
    }

    try {
      const { data: claimed, error: claimError } = await db.rpc('claim_next_job', {
        p_worker_id: workerId,
      })

      if (claimError) {
        console.error('[worker] claim_next_job error:', claimError.message)
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      if (!claimed || claimed.length === 0) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const job = claimed[0] as { id: string; run_id: string; payload: SearchJobPayload }
      console.log(`[worker] Claimed job ${job.id} for run ${job.run_id}`)

      await db.from('search_runs').update({
        status:     'running',
        started_at: new Date().toISOString(),
      }).eq('id', job.run_id)

      try {
        await runSearchPipeline(
          job.run_id,
          job.payload,
          async (update: ProgressUpdate) => {
            // Write to job queue (internal state) and search_runs (Realtime broadcast)
            await db.from('search_job_queue').update({ progress: update }).eq('id', job.id)
            await db.from('search_runs').update({ progress: update }).eq('id', job.run_id)
          },
        )

        await db.from('search_job_queue').update({
          status:       'completed',
          completed_at: new Date().toISOString(),
          progress:     null,
        }).eq('id', job.id)

        console.log(`[worker] Job ${job.id} completed`)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[worker] Job ${job.id} failed:`, errMsg)

        await db.from('search_job_queue').update({
          status:       'failed',
          error:        errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id)

        await db.from('search_runs').update({
          status:       'error',
          error:        errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', job.run_id)
      }
    } catch (err) {
      console.error('[worker] Poll loop error:', err)
      await sleep(POLL_INTERVAL_MS)
    }
  }

  console.log('[worker] Shut down cleanly')
  process.exit(0)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err)
  process.exit(1)
})
