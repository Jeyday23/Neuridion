import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { buildCspHeader } from '@/lib/security/csp'

const encoder = new TextEncoder()

const _compareKeyPromise = globalThis.crypto.subtle.importKey(
  'raw',
  globalThis.crypto.getRandomValues(new Uint8Array(32)),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
)

async function edgeSafeCompare(a: string, b: string): Promise<boolean> {
  const cryptoKey = await _compareKeyPromise
  const [ha, hb] = await Promise.all([
    globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(a)),
    globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(b)),
  ])
  const viewA = new Uint8Array(ha)
  const viewB = new Uint8Array(hb)
  if (viewA.length !== viewB.length) return false
  let diff = 0
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i]
  return diff === 0
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

const MAINTENANCE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Neuridion — Maintenance</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;color:#171717}
.box{text-align:center;max-width:420px;padding:2rem}h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#737373;font-size:.95rem}</style>
</head><body><div class="box"><h1>We'll be right back</h1><p>Neuridion is undergoing scheduled maintenance. Please try again in a few minutes.</p></div></body></html>`

let _sessionHmacKey: string | null = null
async function getSessionHmacKey(): Promise<string> {
  if (_sessionHmacKey) return _sessionHmacKey
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required — session HMAC cannot use a fallback')
  _sessionHmacKey = await hmacSha256Hex(key, 'neuridion-session-v1')
  return _sessionHmacKey
}

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
  '/login/password',
  '/signup',
  '/signup/confirm',

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
const IDLE_COOKIE        = '_neuridion_active'
const IDLE_TIMEOUT_MS    = 30 * 60 * 1000 // 30 minutes

export async function proxy(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE === 'true') {
    const { pathname } = request.nextUrl
    const bypassMaintenance = pathname.startsWith('/api/webhooks/')
      || pathname.startsWith('/api/worker/health')
    if (!bypassMaintenance) {
      if (pathname.startsWith('/api/')) {
        return addSecurityHeaders(NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503, headers: { 'Retry-After': '300' } },
        ))
      }
      return addSecurityHeaders(new NextResponse(MAINTENANCE_PAGE, {
        status: 503,
        headers: { 'Content-Type': 'text/html', 'Retry-After': '300' },
      }))
    }
  }

  const { pathname } = request.nextUrl
  const requestId = globalThis.crypto.randomUUID()
  const SESSION_HMAC_KEY = await getSessionHmacKey()

  // Global per-IP rate limit (120 req/min across all API routes)
  if (pathname.startsWith('/api/')) {
    const limiter = getGlobalLimiter()
    if (limiter) {
      const ip = getIp(request)
      const result = await limiter.limit(ip)
      if (!result.success) {
        const retryAfter = result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60
        return addSecurityHeaders(NextResponse.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(retryAfter), 'x-request-id': requestId } },
        ))
      }
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  // Snapshot which cookies the browser actually sent with THIS request.
  // RSC prefetches fired before the browser processes a login Set-Cookie
  // arrive without auth cookies. Supabase SSR then calls setAll to "delete"
  // those tokens (maxAge=0), racing with the login response that set them.
  // By only forwarding deletions for cookies the request actually carried,
  // we prevent prefetch responses from wiping freshly-issued auth tokens.
  const originalCookieNames = new Set(request.cookies.getAll().map((c) => c.name))

  function isCookieDeletion(options?: { maxAge?: number; expires?: Date }): boolean {
    return (options?.maxAge != null && options.maxAge <= 0)
      || (options?.expires instanceof Date && options.expires.getTime() < Date.now())
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // Token refresh sends mixed batches: deletions (stale chunks) + sets (new token).
          // Pure-deletion batches come from sign-out or RSC prefetch races — block those.
          const hasRealSets = cookiesToSet.some(({ options }) => !isCookieDeletion(options))

          cookiesToSet.forEach(({ name, value, options }) => {
            if (isCookieDeletion(options) && !hasRealSets) return
            if (isCookieDeletion(options) && !originalCookieNames.has(name)) return
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            if (isCookieDeletion(options) && !hasRealSets) return
            if (isCookieDeletion(options) && !originalCookieNames.has(name)) return
            supabaseResponse.cookies.set(name, value, options)
          })
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

  function clearAuthCookies(response: NextResponse): void {
    const allNames = new Set([
      ...originalCookieNames,
      ...request.cookies.getAll().map((c) => c.name),
    ])
    for (const name of allNames) {
      if (name.startsWith('sb-')) response.cookies.delete({ name, path: '/' })
    }
    response.cookies.delete({ name: SESSION_COOKIE, path: '/' })
    response.cookies.delete({ name: IDLE_COOKIE, path: '/' })
  }

  if (!user && originalCookieNames.has(SESSION_COOKIE)) {
    supabaseResponse.cookies.delete({ name: SESSION_COOKIE, path: '/' })
  }
  if (!user && originalCookieNames.has(IDLE_COOKIE)) {
    supabaseResponse.cookies.delete({ name: IDLE_COOKIE, path: '/' })
  }

  // Server-side absolute session expiry (8 hours)
  if (user) {
    const started = request.cookies.get(SESSION_COOKIE)?.value
    if (!started) {
      const ts = String(Date.now())
      const sig = await hmacSha256Hex(SESSION_HMAC_KEY, ts)
      supabaseResponse.cookies.set(SESSION_COOKIE, `${ts}.${sig}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_MS / 1000,
      })
    } else {
      const [tsStr, sig] = started.split('.')
      const expectedSig = await hmacSha256Hex(SESSION_HMAC_KEY, tsStr)
      if (!await edgeSafeCompare(sig ?? '', expectedSig) || Date.now() - Number(tsStr) > SESSION_MAX_AGE_MS) {
        try { await supabase.auth.signOut() } catch { /* session already invalid */ }
        const expiredRes = pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'Session expired' }, { status: 401 })
          : NextResponse.redirect(new URL('/login', request.url))
        clearAuthCookies(expiredRes)
        return addSecurityHeaders(expiredRes)
      }
    }

    // Server-side idle timeout (30 minutes) — skip public pages, webhooks, and workers
    const isIdleExempt = PUBLIC_PATHS.has(pathname)
      || pathname.startsWith('/api/webhooks/')
      || pathname.startsWith('/api/worker/')
      || pathname.startsWith('/claim/')
      || pathname.startsWith('/auth/')
    if (!isIdleExempt) {
      const activeCookie = request.cookies.get(IDLE_COOKIE)?.value
      const hasEstablishedSession = request.cookies.has(SESSION_COOKIE)
      const now = Date.now()
      if (!activeCookie && hasEstablishedSession) {
        try { await supabase.auth.signOut() } catch { /* session already invalid */ }
        const idleRes = pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'Session expired — idle timeout' }, { status: 401 })
          : NextResponse.redirect(new URL('/login', request.url))
        clearAuthCookies(idleRes)
        return addSecurityHeaders(idleRes)
      }
      if (activeCookie) {
        const [activeTs, activeSig] = activeCookie.split('.')
        const expectedActiveSig = (await hmacSha256Hex(SESSION_HMAC_KEY, activeTs)).slice(0, 32)
        if (!await edgeSafeCompare(activeSig ?? '', expectedActiveSig) || now - Number(activeTs) > IDLE_TIMEOUT_MS) {
          try { await supabase.auth.signOut() } catch { /* session already invalid */ }
          const idleRes2 = pathname.startsWith('/api/')
            ? NextResponse.json({ error: 'Session expired — idle timeout' }, { status: 401 })
            : NextResponse.redirect(new URL('/login', request.url))
          clearAuthCookies(idleRes2)
          return addSecurityHeaders(idleRes2)
        }
      }
      // Set/refresh the idle activity cookie with current timestamp
      const ts = String(now)
      const sig = await hmacSha256Hex(SESSION_HMAC_KEY, ts)
      supabaseResponse.cookies.set(IDLE_COOKIE, `${ts}.${sig}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: IDLE_TIMEOUT_MS / 1000,
      })
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
        return addSecurityHeaders(NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: { 'x-request-id': requestId } },
        ))
      }

      let origin = request.headers.get('origin')
      if (!origin) {
        const referer = request.headers.get('referer')
        if (referer) { try { origin = new URL(referer).origin } catch { /* malformed referer */ } }
      }
      if (origin && origin !== 'null') {
        const allowedOrigins = new Set<string>()
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
        if (siteUrl) allowedOrigins.add(new URL(siteUrl).origin)
        const extra = process.env.ALLOWED_ORIGINS
        if (extra) extra.split(',').forEach((o) => allowedOrigins.add(o.trim()))
        if (process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV && !process.env.RENDER) {
          allowedOrigins.add('http://localhost:3000')
          allowedOrigins.add('http://127.0.0.1:3000')
        }
        if (!allowedOrigins.has(origin)) {
          return addSecurityHeaders(NextResponse.json(
            { error: 'Forbidden' },
            { status: 403, headers: { 'x-request-id': requestId } },
          ))
        }
      }
    }
  }

  // API routes: protect non-public endpoints, then return with refreshed cookies
  if (pathname.startsWith('/api/')) {
    if (!user) {
      const isPublicApi = PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))
      if (!isPublicApi) {
        return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'x-request-id': requestId } }))
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
      return addSecurityHeaders(NextResponse.redirect(new URL('/login?deleted=1', request.url)))
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
      return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard/search', request.url)))
    }
  }

  // Authenticated user visiting login/signup → send to dashboard
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard/search', request.url)))
  }

  // Unauthenticated user visiting a protected route → send to login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    const redirectRes = NextResponse.redirect(loginUrl)
    if (originalCookieNames.has(SESSION_COOKIE)) redirectRes.cookies.delete({ name: SESSION_COOKIE, path: '/' })
    if (originalCookieNames.has(IDLE_COOKIE)) redirectRes.cookies.delete({ name: IDLE_COOKIE, path: '/' })
    return addSecurityHeaders(redirectRes)
  }

  // CSP nonce — inject per-request nonce into response headers (all environments)
  const nonce = randomNonce()
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
 * Called on both the final supabaseResponse AND every early-return response.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=(), fullscreen=(self)')
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
