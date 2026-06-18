import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from '@/lib/utils/timeout'

describe('withTimeout', () => {
  it('rejects with the operation label when work exceeds the timeout', async () => {
    vi.useFakeTimers()

    const pending = withTimeout(
      new Promise((resolve) => setTimeout(() => resolve('late'), 1_000)),
      50,
      'PDF generation',
    )
    const expectation = expect(pending).rejects.toThrow('PDF generation timed out after 50ms')

    await vi.advanceTimersByTimeAsync(50)
    await expectation

    vi.useRealTimers()
  })
})
