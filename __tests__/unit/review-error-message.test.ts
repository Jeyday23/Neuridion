import { describe, expect, it } from 'vitest'
import { reviewErrorMessage } from '@/app/dashboard/archive/[id]/run-results'

function res(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

describe('run review error message', () => {
  it.each([403, 409, 422])('shows the API reason for %s', async (status) => {
    const message = 'Every required record must have a final disposition before approval.'
    expect(await reviewErrorMessage(res(status, { error: message }))).toBe(message)
  })

  it('keeps 5xx details generic', async () => {
    expect(await reviewErrorMessage(res(500, { error: 'relation "x" does not exist' })))
      .toBe('Failed to update review status. Please try again.')
  })

  it('handles non-JSON bodies and rate limits', async () => {
    expect(await reviewErrorMessage(res(422, 'not json'))).toBe('Failed to update review status. Please try again.')
    expect(await reviewErrorMessage(res(429, {}))).toContain('Too many requests')
  })
})
