import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Defense-in-depth authentication middleware.
 *
 * This is a safety net — not the primary auth mechanism. Individual API routes
 * still perform their own authorization checks (role verification, RLS, etc.).
 * The middleware ensures that no route is accidentally left publicly accessible
 * if a developer forgets to add an auth guard.
 *
 * It also refreshes expired sessions by calling `getUser()`, which validates
 * the JWT server-side and triggers token refresh when needed. The refreshed
 * tokens are written back to cookies via the `setAll` handler.
 */

/** Routes that must remain publicly accessible (no session required). */
const PUBLIC_ROUTE_PREFIXES = [
  '/api/auth/',
  '/api/claim/',
  '/api/consent/',
  '/api/webhooks/',
  '/api/worker/',
  '/login',
  '/claim/',
  '/auth/',
] as const

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export async function middleware(request: NextRequest) {
  // Start with a plain next response so we can attach cookies to it
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
          // Write updated auth cookies to the request (for downstream SSR)
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          // Re-create the response so it picks up the mutated request cookies
          supabaseResponse = NextResponse.next({ request })
          // Write cookies to the outgoing response
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          // Apply cache-control headers to prevent CDN caching of auth responses
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // IMPORTANT: Do NOT use getSession() — it reads cookies without server-side
  // JWT validation. getUser() contacts the Auth server and refreshes tokens.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes — allow through regardless of auth status
  if (isPublicRoute(pathname)) {
    return supabaseResponse
  }

  // Protected routes — require a valid user
  if (!user) {
    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Page routes — redirect to login with a return URL
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

/**
 * Matcher config — skip middleware entirely for static assets and Next.js
 * internals. Everything else runs through the middleware function above,
 * where public vs protected routing is decided.
 */
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Common static asset extensions
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
