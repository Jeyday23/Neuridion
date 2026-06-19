import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry } from '@/lib/scrapers/fetch-with-retry'

describe('fetchWithRetry cancellation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('stops immediately when the parent signal aborts during a request', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = fetchWithRetry('https://example.test/data', { signal: controller.signal })
    controller.abort(new Error('source deadline reached'))

    await expect(pending).rejects.toThrow('source deadline reached')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not begin another retry after cancellation during backoff', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = fetchWithRetry(
      'https://example.test/data',
      { signal: controller.signal },
      { backoffs: [10_000, 10_000], maxAttempts: 3 },
    )
    await vi.advanceTimersByTimeAsync(1)
    controller.abort(new Error('cancelled during backoff'))

    await expect(pending).rejects.toThrow('cancelled during backoff')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
