import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set([
  '/login',
  '/signup',
  '/claim',
  '/pricing',
  '/contact',
  '/privacy',
  '/terms',
  '/dpa',
  '/ai-transparency',
  '/withdrawal',
  '/accessibility',
  '/impressum',
])

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/claim/',
  '/api/consent/',
  '/api/contact',
  '/api/bugs',
]

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true
  for (const route of PUBLIC_ROUTES) {
    if (pathname === route || pathname.startsWith(route + '/')) return true
  }
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
  }
  if (pathname.startsWith('/_next/') || pathname.startsWith('/static/') || pathname.includes('.')) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicRoute(pathname)) return NextResponse.next()

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const sessionStarted = request.cookies.get('session_started_at')?.value
  if (sessionStarted) {
    const absoluteMs = 8 * 60 * 60 * 1000
    const elapsed = Date.now() - parseInt(sessionStarted, 10)
    if (elapsed > absoluteMs) {
      await supabase.auth.signOut({ scope: 'local' })
      response.cookies.set('session_started_at', '', { maxAge: 0, path: '/' })
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Session expired' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login?reason=session_expired', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)',
  ],
}
