import { randomUUID } from 'crypto'
import { Client } from '@upstash/qstash'
import { scheduledSources } from '@/lib/ingestion/config'
import { authenticatedWorkerPost } from '@/lib/worker/authenticated-route'

export const maxDuration = 60

async function scheduleHandler(): Promise<Response> {
  const sources = scheduledSources()
  const token = process.env.QSTASH_TOKEN
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!token || !siteUrl) return Response.json({ error: 'Job queue not configured' }, { status: 503 })
  if (sources.length === 0) return Response.json({ enqueued: [], message: 'Scheduled ingestion is disabled' })

  const asOfDate = new Date().toISOString().slice(0, 10)
  const qstash = new Client({ token })
  const settled = await Promise.allSettled(sources.map(async (source) => {
    const runId = randomUUID()
    await qstash.publishJSON({
      url: `${siteUrl}/api/worker/ingest/${source}`,
      body: { run_id: runId, source, as_of_date: asOfDate },
      retries: 2,
      timeout: 800,
    })
    return { source, run_id: runId }
  }))
  const enqueued = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  const failed = settled.flatMap((result, index) => result.status === 'rejected'
    ? [{ source: sources[index], error: 'enqueue_failed' }]
    : [])
  if (failed.length > 0) console.error('[ingestion-schedule] fan-out failures:', failed)
  return Response.json({ enqueued, failed })
}

export async function POST(request: Request): Promise<Response> {
  return authenticatedWorkerPost(request, scheduleHandler)
}

