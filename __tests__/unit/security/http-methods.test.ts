import { describe, expect, it } from 'vitest'
import { isUnsupportedPageMethod } from '../../../lib/security/http-methods'

describe('isUnsupportedPageMethod', () => {
  it.each(['PUT', 'PATCH', 'DELETE'])('rejects %s on page routes', (method) => {
    expect(isUnsupportedPageMethod('/', method)).toBe(true)
  })

  it.each(['GET', 'HEAD', 'POST', 'OPTIONS'])('allows %s on page routes', (method) => {
    expect(isUnsupportedPageMethod('/login', method)).toBe(false)
  })

  it('leaves API method handling to route handlers', () => {
    expect(isUnsupportedPageMethod('/api/reports', 'DELETE')).toBe(false)
  })
})
