import { describe, it, expect } from 'vitest'
import { buildCspHeader } from '../../../lib/security/csp'

const VALID_NONCE = 'dGVzdC1ub25jZS0xMjM0NTY='

describe('buildCspHeader', () => {
  it('includes the nonce in script-src', () => {
    const header = buildCspHeader(VALID_NONCE)
    expect(header).toContain(`'nonce-${VALID_NONCE}'`)
  })

  it('blocks object-src', () => {
    const header = buildCspHeader(VALID_NONCE)
    expect(header).toContain("object-src 'none'")
  })

  it('blocks frame-ancestors', () => {
    const header = buildCspHeader(VALID_NONCE)
    expect(header).toContain("frame-ancestors 'none'")
  })

  it('includes all required connect-src domains', () => {
    const header = buildCspHeader(VALID_NONCE)
    const requiredDomains = [
      'https://*.supabase.co',
      'https://api.stripe.com',
    ]
    for (const domain of requiredDomains) {
      expect(header).toContain(domain)
    }
  })

  it('excludes server-only origins from connect-src', () => {
    const header = buildCspHeader(VALID_NONCE)
    const serverOnly = [
      'https://api.anthropic.com',
      'https://api.pdfshift.io',
      'https://api.resend.com',
      'https://api.firecrawl.dev',
      'https://fsca.swissmedic.ch',
      'https://api.fda.gov',
    ]
    for (const domain of serverOnly) {
      expect(header).not.toContain(domain)
    }
  })

  it('enforces upgrade-insecure-requests', () => {
    const header = buildCspHeader(VALID_NONCE)
    expect(header).toContain('upgrade-insecure-requests')
  })
})
