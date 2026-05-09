import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_API_ROUTES = [
  '/api/auth/',
  '/api/claim/',
  '/api/webhooks/',
  '/api/consent/',
  '/api/worker/',
]

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000
const SESSION_COOKIE     = 'session_started_at'

export async function middleware(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

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
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // Protect dashboard and admin page routes
  if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Protect API routes (except public ones)
  if (!user && pathname.startsWith('/api/')) {
    const isPublic = PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r))
    if (!isPublic) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/search'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/:path*'],
}
