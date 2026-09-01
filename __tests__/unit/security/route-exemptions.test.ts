import { describe, expect, it } from 'vitest'
import {
  CSRF_EXEMPTIONS,
  PUBLIC_API_EXEMPTIONS,
  isRouteExempt,
} from '@/lib/security/route-exemptions'

const AUTH_ROUTES = [
  '/api/auth/logout',
  '/api/auth/otp',
  '/api/auth/post-login',
] as const

const WORKER_ROUTES = [
  '/api/worker/cleanup',
  '/api/worker/extract',
  '/api/worker/health',
  '/api/worker/ingest/schedule',
  '/api/worker/ingest/bfarm',
  '/api/worker/ingest/mhra',
  '/api/worker/ingest/swissmedic',
  '/api/worker/process-job',
  '/api/worker/scraper-health',
] as const

const CLAIM_ROUTE_TEMPLATE = '/api/claim/:code'
const STRIPE_WEBHOOK_ROUTE = '/api/webhooks/stripe'

const PUBLIC_ROUTE_KEYS = [
  ...AUTH_ROUTES,
  CLAIM_ROUTE_TEMPLATE,
  STRIPE_WEBHOOK_ROUTE,
  '/api/consent/cookies',
  '/api/contact',
  ...WORKER_ROUTES,
] as const

const CSRF_ROUTE_KEYS = [
  ...AUTH_ROUTES,
  CLAIM_ROUTE_TEMPLATE,
  STRIPE_WEBHOOK_ROUTE,
  '/api/consent/cookies',
  ...WORKER_ROUTES,
] as const

function sortedKeys(table: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(table).sort()
}

function exactRouteCases(routeKeys: readonly string[]) {
  return routeKeys
    .filter((route) => route !== CLAIM_ROUTE_TEMPLATE)
    .map((route) => ({
      allowedPath: route,
      siblingPath: `${route}-anything`,
    }))
}

describe('public API route exemptions', () => {
  it('enumerates every intended public API route and no directory-wide exemptions', () => {
    expect(sortedKeys(PUBLIC_API_EXEMPTIONS)).toEqual([...PUBLIC_ROUTE_KEYS].sort())
  })

  it.each(exactRouteCases(PUBLIC_ROUTE_KEYS))(
    'allows $allowedPath but denies sibling $siblingPath',
    ({ allowedPath, siblingPath }) => {
      expect(isRouteExempt(allowedPath, PUBLIC_API_EXEMPTIONS)).toBe(true)
      expect(isRouteExempt(siblingPath, PUBLIC_API_EXEMPTIONS)).toBe(false)
    },
  )

  it('allows one valid claim-code segment without broadening the claim directory', () => {
    expect(isRouteExempt('/api/claim/Trial_Code-123', PUBLIC_API_EXEMPTIONS)).toBe(true)
    expect(isRouteExempt('/api/claim-anything/Trial_Code-123', PUBLIC_API_EXEMPTIONS)).toBe(false)
    expect(isRouteExempt('/api/claim/Trial_Code-123/anything', PUBLIC_API_EXEMPTIONS)).toBe(false)
  })

  it.each([
    '/api/claim/abc',
    `/api/claim/${'a'.repeat(65)}`,
    '/api/claim/code.with-dot',
    '/api/claim/code%2Fanything',
  ])('rejects invalid claim-code path %s', (pathname) => {
    expect(isRouteExempt(pathname, PUBLIC_API_EXEMPTIONS)).toBe(false)
  })

  it('matches only the real Stripe webhook route', () => {
    expect(isRouteExempt('/api/webhooks/stripe', PUBLIC_API_EXEMPTIONS)).toBe(true)
    expect(isRouteExempt('/api/webhooks/stripe-anything', PUBLIC_API_EXEMPTIONS)).toBe(false)
  })
})

describe('CSRF route exemptions', () => {
  it('enumerates every intended CSRF exemption and no directory-wide exemptions', () => {
    expect(sortedKeys(CSRF_EXEMPTIONS)).toEqual([...CSRF_ROUTE_KEYS].sort())
  })

  it.each(exactRouteCases(CSRF_ROUTE_KEYS))(
    'allows $allowedPath but denies sibling $siblingPath',
    ({ allowedPath, siblingPath }) => {
      expect(isRouteExempt(allowedPath, CSRF_EXEMPTIONS)).toBe(true)
      expect(isRouteExempt(siblingPath, CSRF_EXEMPTIONS)).toBe(false)
    },
  )

  it('allows one valid claim-code segment without broadening the claim directory', () => {
    expect(isRouteExempt('/api/claim/Trial_Code-123', CSRF_EXEMPTIONS)).toBe(true)
    expect(isRouteExempt('/api/claim-anything/Trial_Code-123', CSRF_EXEMPTIONS)).toBe(false)
    expect(isRouteExempt('/api/claim/Trial_Code-123/anything', CSRF_EXEMPTIONS)).toBe(false)
    expect(isRouteExempt('/api/claim/abc', CSRF_EXEMPTIONS)).toBe(false)
  })

  it('matches only the real Stripe webhook route', () => {
    expect(isRouteExempt('/api/webhooks/stripe', CSRF_EXEMPTIONS)).toBe(true)
    expect(isRouteExempt('/api/webhooks/stripe-anything', CSRF_EXEMPTIONS)).toBe(false)
  })
})
