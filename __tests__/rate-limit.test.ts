import { describe, it, expect } from 'vitest'
import { rateLimit } from '../lib/rate-limit'

describe('rateLimit (in-memory fallback)', () => {
  it('allows requests under the limit', async () => {
    const key = `test-allow-${Date.now()}`
    const result = await rateLimit(key, 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it('blocks requests over the limit', async () => {
    const key = `test-block-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      await rateLimit(key, 3, 60_000)
    }
    const result = await rateLimit(key, 3, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })
})
