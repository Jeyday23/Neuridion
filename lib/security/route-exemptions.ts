type ExactRouteExemption = Readonly<{ kind: 'exact' }>
type SingleSegmentRouteExemption = Readonly<{
  kind: 'single-segment'
  segmentPattern: RegExp
}>

export type RouteExemption = ExactRouteExemption | SingleSegmentRouteExemption
export type RouteExemptionTable = Readonly<Record<string, RouteExemption>>

const exact = { kind: 'exact' } as const

const WORKER_EXEMPTIONS = {
  '/api/worker/cleanup': exact,
  '/api/worker/extract': exact,
  '/api/worker/health': exact,
  '/api/worker/ingest/bfarm': exact,
  '/api/worker/ingest/mhra': exact,
  '/api/worker/ingest/swissmedic': exact,
  '/api/worker/ingest/schedule': exact,
  '/api/worker/process-job': exact,
  '/api/worker/scraper-health': exact,
} as const satisfies RouteExemptionTable

const AUTH_EXEMPTIONS = {
  '/api/auth/logout': exact,
  '/api/auth/otp': exact,
  '/api/auth/post-login': exact,
} as const satisfies RouteExemptionTable

const CLAIM_EXEMPTION = {
  '/api/claim/:code': {
    kind: 'single-segment',
    segmentPattern: /^[A-Za-z0-9_-]{4,64}$/,
  },
} as const satisfies RouteExemptionTable

/**
 * API routes that intentionally authenticate inside the route handler rather
 * than through the Supabase browser session in proxy.ts.
 *
 * Keep every route explicit. Adding a sibling handler must not silently make
 * it public merely because it shares a string prefix with an existing route.
 */
export const PUBLIC_API_EXEMPTIONS = {
  ...AUTH_EXEMPTIONS,
  ...CLAIM_EXEMPTION,
  '/api/webhooks/stripe': exact,
  '/api/consent/cookies': exact,
  '/api/contact': exact,
  ...WORKER_EXEMPTIONS,
} as const satisfies RouteExemptionTable

/**
 * Mutating routes that legitimately accept non-standard request bodies or
 * authenticate without the normal JSON/session CSRF boundary.
 */
export const CSRF_EXEMPTIONS = {
  ...AUTH_EXEMPTIONS,
  ...CLAIM_EXEMPTION,
  '/api/webhooks/stripe': exact,
  '/api/consent/cookies': exact,
  ...WORKER_EXEMPTIONS,
} as const satisfies RouteExemptionTable

function matchesSingleSegmentTemplate(
  pathname: string,
  template: string,
  segmentPattern: RegExp,
): boolean {
  const pathSegments = pathname.split('/')
  const templateSegments = template.split('/')
  if (pathSegments.length !== templateSegments.length) return false

  for (let index = 0; index < templateSegments.length; index += 1) {
    const expected = templateSegments[index]
    const actual = pathSegments[index]
    if (expected.startsWith(':')) {
      if (!segmentPattern.test(actual)) return false
      continue
    }
    if (actual !== expected) return false
  }

  return true
}

export function isRouteExempt(
  pathname: string,
  exemptions: RouteExemptionTable,
): boolean {
  for (const [template, exemption] of Object.entries(exemptions)) {
    if (exemption.kind === 'exact') {
      if (pathname === template) return true
      continue
    }

    if (matchesSingleSegmentTemplate(pathname, template, exemption.segmentPattern)) {
      return true
    }
  }

  return false
}
