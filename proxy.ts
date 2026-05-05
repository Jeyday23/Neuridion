import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/', '/login', '/signup', '/signup/confirm', '/admin/login',
  '/privacy', '/terms', '/imprint', '/dpa',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Build response that carries refreshed cookies forward — must run for ALL routes
  // including /api/ so server-side getUser() receives a valid session token.
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

  // API routes manage their own auth redirects — return with refreshed cookies only
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/claim/')

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
