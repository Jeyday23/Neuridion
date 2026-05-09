import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/', '/login', '/signup', '/signup/confirm', '/admin/login',
  '/privacy', '/terms', '/imprint', '/dpa',
]

const PUBLIC_API_ROUTES = [
  '/api/auth/',
  '/api/claim/',
  '/api/webhooks/',
  '/api/consent/',
  '/api/worker/',
]

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000
const SESSION_COOKIE     = 'session_started_at'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Server-side absolute session expiry (8 hours)
  if (user) {
    const started = request.cookies.get(SESSION_COOKIE)?.value
    if (!started) {
      supabaseResponse.cookies.set(SESSION_COOKIE, String(Date.now()), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_MS / 1000,
      })
    } else if (Date.now() - Number(started) > SESSION_MAX_AGE_MS) {
      await supabase.auth.signOut()
      supabaseResponse.cookies.delete(SESSION_COOKIE)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Session expired' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // API routes: protect non-public endpoints, then return with refreshed cookies
  if (pathname.startsWith('/api/')) {
    if (!user) {
      const isPublicApi = PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))
      if (!isPublicApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    return supabaseResponse
  }

  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/claim/') || pathname.startsWith('/auth/')

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
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
