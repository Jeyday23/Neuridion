interface RetryOptions {
  maxAttempts?: number
  backoffs?: number[]
  timeoutMs?: number
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? 3
  const backoffs = opts?.backoffs ?? [1_000, 2_000, 4_000]
  const timeoutMs = opts?.timeoutMs ?? 30_000
  let lastError = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const existing = init?.signal ?? undefined
    const abortFromParent = () => controller.abort(existing?.reason)
    if (existing?.aborted) controller.abort(existing.reason)
    else existing?.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })

      if (res.ok) return res

      if (res.status >= 500 && attempt < maxAttempts - 1) {
        lastError = `HTTP ${res.status}`
        clearTimeout(timeout)
        await wait(backoffs[attempt], existing)
        continue
      }

      return res
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (existing?.aborted) throw (existing.reason ?? err)
      if (attempt < maxAttempts - 1) {
        clearTimeout(timeout)
        await wait(backoffs[attempt], existing)
        continue
      }
      throw new Error(`Fetch failed after ${maxAttempts} attempts for ${String(url)}: ${lastError}`)
    } finally {
      clearTimeout(timeout)
      existing?.removeEventListener('abort', abortFromParent)
    }
  }

  throw new Error(`All ${maxAttempts} attempts exhausted for ${String(url)}: ${lastError}`)
}
