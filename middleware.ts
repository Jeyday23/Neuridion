import { NextResponse, type NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const CSRF_EXEMPT = new Set(['/api/webhooks/stripe'])

const PUBLIC_API_ROUTES = new Set([
  '/api/webhooks/stripe',
  '/api/auth/logout',
  '/api/contact',
  '/api/consent/cookies',
  '/api/auth/otp',
])

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_API_ROUTES.has(pathname)) return true
  if (pathname.startsWith('/api/claim/')) return true
  return false
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function getIp(request: NextRequest): string {
  return request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? '127.0.0.1'
}

let globalLimiter: Ratelimit | null = null
function getGlobalLimiter(): Ratelimit | null {
  if (globalLimiter) return globalLimiter
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  globalLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(120, '60 s'),
    prefix: 'rl:global',
  })
  return globalLimiter
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // Generate a unique request ID for correlation in logs and downstream handlers.
  const requestId = crypto.randomUUID()

  // Global per-IP rate limit (120 req/min across all API routes)
  const limiter = getGlobalLimiter()
  if (limiter) {
    const ip = getIp(request)
    const result = await limiter.limit(ip)
    if (!result.success) {
      const retryAfter = result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter), 'x-request-id': requestId } },
      )
    }
  }

  // CSRF check on all mutating routes (including public ones like consent)
  if (MUTATING_METHODS.has(request.method) && !CSRF_EXEMPT.has(pathname)) {
    const origin = request.headers.get('origin')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (origin && siteUrl) {
      const allowed = new URL(siteUrl).origin
      if (origin !== allowed) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: { 'x-request-id': requestId } },
        )
      }
    }
  }

  const response = NextResponse.next()
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
