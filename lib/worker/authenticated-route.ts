import { safeCompare } from '@/lib/utils/auth'

export async function authenticatedWorkerPost(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (process.env.ENABLE_DEV_WORKER_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
    const secret = request.headers.get('x-worker-secret')
    const expected = process.env.WORKER_API_SECRET
    if (!secret || !expected || !safeCompare(secret, expected)) {
      return new Response('Unauthorized', { status: 401 })
    }
    return handler(request)
  }
  try {
    const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
    return await verifySignatureAppRouter(handler)(request)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
}

