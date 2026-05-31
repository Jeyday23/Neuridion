interface RetryOptions {
  maxAttempts?: number
  backoffs?: number[]
  timeoutMs?: number
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
    const existing = init?.signal
    if (existing) {
      existing.addEventListener('abort', () => controller.abort(existing.reason))
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })

      if (res.ok) return res

      if (res.status >= 500 && attempt < maxAttempts - 1) {
        lastError = `HTTP ${res.status}`
        clearTimeout(timeout)
        await new Promise(r => setTimeout(r, backoffs[attempt]))
        continue
      }

      return res
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < maxAttempts - 1) {
        clearTimeout(timeout)
        await new Promise(r => setTimeout(r, backoffs[attempt]))
        continue
      }
      throw new Error(`Fetch failed after ${maxAttempts} attempts for ${String(url)}: ${lastError}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(`All ${maxAttempts} attempts exhausted for ${String(url)}: ${lastError}`)
}
