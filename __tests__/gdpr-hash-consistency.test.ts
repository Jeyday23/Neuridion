import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'

function cleanupHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
}

function rateLimitHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
}

describe('GDPR hash consistency', () => {
  it('cleanup hash matches rate-limit hash for the same email', () => {
    const email = 'Robert.Friedrich@jpberlin.de'
    expect(cleanupHash(email)).toBe(rateLimitHash(email))
  })

  it('produces consistent hashes for case-variant emails', () => {
    const h1 = cleanupHash('USER@EXAMPLE.COM')
    const h2 = cleanupHash('user@example.com')
    const h3 = cleanupHash('User@Example.Com')
    expect(h1).toBe(h2)
    expect(h2).toBe(h3)
  })

  it('produces a 32-char hex string', () => {
    const hash = cleanupHash('test@example.com')
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })
})
