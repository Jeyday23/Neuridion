import { NextResponse, type NextRequest } from 'next/server'

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api/')) return NextResponse.next()

  if (isPublicRoute(pathname)) return NextResponse.next()

  if (MUTATING_METHODS.has(request.method)) {
    if (pathname === '/api/webhooks/stripe') return NextResponse.next()

    const origin = request.headers.get('origin')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (origin && siteUrl) {
      const allowed = new URL(siteUrl).origin
      if (origin !== allowed) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 },
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
