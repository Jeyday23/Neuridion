import { describe, expect, it } from 'vitest'
import { messageFromError } from '@/lib/ui/api-error-message'

describe('messageFromError', () => {
  it('uses the error message when available', () => {
    expect(messageFromError(new Error('Session expired. Please sign in again.'), 'Fallback')).toBe('Session expired. Please sign in again.')
  })

  it('falls back for non-error throws', () => {
    expect(messageFromError('boom', 'Fallback')).toBe('Fallback')
  })
})
