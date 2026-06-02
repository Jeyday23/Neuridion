import { describe, it, expect } from 'vitest'

function redactSensitive(raw: string): string {
  return raw.slice(0, 200)
    .replace(/(?:sk-|fc-|Bearer\s+)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
}

describe('firecrawl log redaction', () => {
  it('redacts sk- prefixed API keys', () => {
    const input = 'Error: auth failed with key sk-ant-api03-abc123def456ghi789'
    expect(redactSensitive(input)).toBe('Error: auth failed with key [REDACTED]')
  })

  it('redacts fc- prefixed tokens', () => {
    const input = 'Token fc-abcdef1234567890 expired'
    expect(redactSensitive(input)).toBe('Token [REDACTED] expired')
  })

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9_long_token_here'
    expect(redactSensitive(input)).toBe('Authorization: [REDACTED]')
  })

  it('redacts long hex strings (32+ chars)', () => {
    const hex = 'a'.repeat(40)
    const input = `hash=${hex} done`
    expect(redactSensitive(input)).toBe('hash=[REDACTED] done')
  })

  it('preserves normal error text', () => {
    const input = 'HTTP 500: Internal server error from firecrawl'
    expect(redactSensitive(input)).toBe(input)
  })

  it('truncates to 200 chars', () => {
    const input = 'x'.repeat(500)
    expect(redactSensitive(input).length).toBeLessThanOrEqual(200)
  })
})
