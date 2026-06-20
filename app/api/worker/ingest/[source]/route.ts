import { z } from 'zod'
import { ingestSource } from '@/lib/ingestion/run'
import { isScheduledSource, scheduledSources } from '@/lib/ingestion/config'
import { authenticatedWorkerPost } from '@/lib/worker/authenticated-route'

export const maxDuration = 800

const jobSchema = z.object({
  run_id: z.string().uuid(),
  source: z.string(),
  as_of_date: z.iso.date(),
})

async function ingestHandler(
  request: Request,
  routeSource: string,
): Promise<Response> {
  const parsed = jobSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response('Invalid ingestion payload', { status: 400 })
  if (!isScheduledSource(routeSource) || parsed.data.source !== routeSource) {
    return new Response('Unknown ingestion source', { status: 400 })
  }
  if (!scheduledSources().includes(routeSource)) {
    return new Response('Ingestion source disabled', { status: 409 })
  }
  try {
    const summary = await ingestSource({
      runId: parsed.data.run_id,
      source: routeSource,
      asOfDate: parsed.data.as_of_date,
    })
    if (summary.outcome === 'failed') {
      return Response.json({ source: routeSource, error: 'Source ingestion failed' }, { status: 503 })
    }
    return Response.json(summary)
  } catch (error) {
    console.error(`[ingestion] ${routeSource} failed:`, error instanceof Error ? error.message : String(error))
    return Response.json({ source: routeSource, error: 'Ingestion failed' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ source: string }> },
): Promise<Response> {
  const { source } = await context.params
  return authenticatedWorkerPost(request, (verifiedRequest) => ingestHandler(verifiedRequest, source))
}
