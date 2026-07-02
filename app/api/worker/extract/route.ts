import { authenticatedWorkerPost } from '@/lib/worker/authenticated-route'
import { extractPendingDocuments } from '@/lib/extraction/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return authenticatedWorkerPost(request, async (req) => {
    const body = await req.json().catch(() => ({})) as { limit?: number }
    const limit = Number.isFinite(body.limit) ? Math.min(Math.max(Number(body.limit), 1), 100) : 20
    try {
      return Response.json(await extractPendingDocuments(limit))
    } catch (err) {
      console.error('[worker:extract]', err instanceof Error ? err.message : String(err))
      return Response.json({ error: 'Document extraction failed' }, { status: 500 })
    }
  })
}
