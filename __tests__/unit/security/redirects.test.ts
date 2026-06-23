import { describe, expect, it } from 'vitest'
import { safeInternalRedirectPath } from '../../../lib/security/redirects'

describe('safeInternalRedirectPath', () => {
  it('accepts same-origin paths with query strings', () => {
    expect(safeInternalRedirectPath('/dashboard/search?run=123')).toBe('/dashboard/search?run=123')
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/dashboard\\evil',
    '/dashboard\u0000evil',
  ])('rejects unsafe redirect value %j', (value) => {
    expect(safeInternalRedirectPath(value)).toBe('/dashboard/search')
  })

  it('uses the supplied fallback for missing values', () => {
    expect(safeInternalRedirectPath(null, '/login')).toBe('/login')
  })
})

