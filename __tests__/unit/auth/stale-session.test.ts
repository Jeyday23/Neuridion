import { describe, expect, it } from 'vitest'
import { isStaleSessionAuthError } from '@/lib/auth/stale-session'

describe('isStaleSessionAuthError', () => {
  it('detects Supabase refresh-token failures', () => {
    expect(isStaleSessionAuthError({ code: 'refresh_token_not_found' })).toBe(true)
    expect(isStaleSessionAuthError(new Error('Invalid Refresh Token: Refresh Token Not Found'))).toBe(true)
  })

  it('ignores unrelated auth errors', () => {
    expect(isStaleSessionAuthError({ code: 'email_not_confirmed' })).toBe(false)
    expect(isStaleSessionAuthError(null)).toBe(false)
  })
})
