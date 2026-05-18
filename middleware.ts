import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { buildCspHeader } from '@/lib/security/csp'
import { safeCompare } from '@/lib/utils/auth'

function getSessionHmacKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required — session HMAC cannot use a fallback')
  return crypto.createHmac('sha256', key).update('neuridion-session-v1').digest('hex')
}

const SESSION_HMAC_KEY = getSessionHmacKey()

// ── Global per-IP rate limiting (120 req/min) ────────────────────────────────

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

function getIp(request: NextRequest): string {
  return request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? '127.0.0.1'
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/signup/confirm',
  '/admin/login',
  '/pricing',
  '/contact',
  '/privacy',
  '/terms',
  '/dpa',
  '/ai-transparency',
  '/withdrawal',
  '/accessibility',
  '/imprint',
  '/sample-report',
  '/faq',
])

const PUBLIC_API_ROUTES = [
  '/api/auth/',
  '/api/claim/',
  '/api/webhooks/',
  '/api/consent/cookies',
  '/api/contact',
  '/api/worker/',
]

// Routes exempt from CSRF content-type check (webhooks use non-JSON payloads,
// auth and claim routes may be called from HTML forms)
const CSRF_EXEMPT_ROUTES = [
  '/api/webhooks/stripe',
  '/api/auth/',
  '/api/claim/',
  '/api/consent/cookies',
  '/api/worker/',
]

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000
const SESSION_COOKIE     = 'session_started_at'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestId = crypto.randomUUID()

  // Global per-IP rate limit (120 req/min across all API routes)
  if (pathname.startsWith('/api/')) {
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
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponse.headers.set(key, value)
            )
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Clear stale session cookie when no authenticated user exists
  if (!user && request.cookies.has(SESSION_COOKIE)) {
    supabaseResponse.cookies.delete(SESSION_COOKIE)
  }

  // Server-side absolute session expiry (8 hours)
  if (user) {
    const started = request.cookies.get(SESSION_COOKIE)?.value
    if (!started) {
      const ts = String(Date.now())
      const sig = crypto.createHmac('sha256', SESSION_HMAC_KEY).update(ts).digest('hex').slice(0, 32)
      supabaseResponse.cookies.set(SESSION_COOKIE, `${ts}.${sig}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_MS / 1000,
      })
    } else {
      const [tsStr, sig] = started.split('.')
      const expectedSig = crypto.createHmac('sha256', SESSION_HMAC_KEY).update(tsStr).digest('hex').slice(0, 32)
      if (!safeCompare(sig, expectedSig) || Date.now() - Number(tsStr) > SESSION_MAX_AGE_MS) {
        await supabase.auth.signOut()
        supabaseResponse.cookies.delete(SESSION_COOKIE)
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Session expired' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }

  // CSRF protection on mutating API routes (two layers):
  // 1. Custom header check — browser SOP prevents cross-origin JS from setting
  //    custom headers, so x-csrf-protection proves the request is from our SPA.
  // 2. Origin check — defense-in-depth against misconfigured CORS.
  if (pathname.startsWith('/api/') && MUTATING_METHODS.has(request.method)) {
    const isExempt = CSRF_EXEMPT_ROUTES.some((r) => pathname.startsWith(r))
    if (!isExempt) {
      if (!request.headers.has('x-csrf-protection')) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: { 'x-request-id': requestId } },
        )
      }

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
  }

  // API routes: protect non-public endpoints, then return with refreshed cookies
  if (pathname.startsWith('/api/')) {
    if (!user) {
      const isPublicApi = PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))
      if (!isPublicApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'x-request-id': requestId } })
      }
    }
    supabaseResponse.headers.set('x-request-id', requestId)
    return addSecurityHeaders(supabaseResponse)
  }

  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith('/claim/') || pathname.startsWith('/auth/')

  // Authenticated user on dashboard routes — check for pending hard deletion
  if (user && pathname.startsWith('/dashboard')) {
    const { data: userData } = await supabase
      .from('users')
      .select('deleted_at')
      .eq('id', user.id)
      .single()

    if (userData?.deleted_at && new Date(userData.deleted_at) <= new Date()) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?deleted=1', request.url))
    }
  }

  // Admin pages require admin role
  if (user && pathname.startsWith('/admin')) {
    const { data } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (data?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard/search', request.url))
    }
  }

  // Authenticated user visiting login/signup → send to dashboard
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard/search', request.url))
  }

  // Unauthenticated user visiting a protected route → send to login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // CSP nonce — inject per-request nonce into response headers (all environments)
  const nonce = crypto.randomBytes(16).toString('base64')
  supabaseResponse.headers.set('x-nonce', nonce)
  if (process.env.NODE_ENV === 'production') {
    supabaseResponse.headers.set('Content-Security-Policy', buildCspHeader(nonce))
  } else {
    supabaseResponse.headers.set('Content-Security-Policy', buildCspHeader(nonce).replace(
      "script-src 'self'",
      "script-src 'self' 'unsafe-eval'"
    ))
  }

  supabaseResponse.headers.set('x-request-id', requestId)
  return addSecurityHeaders(supabaseResponse)
}

/**
 * Adds defense-in-depth security headers to every response.
 * HSTS and CSP are handled separately (next.config.ts / buildCspHeader).
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
