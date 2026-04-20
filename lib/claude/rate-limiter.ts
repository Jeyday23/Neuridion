// Anthropic org limit: 50 RPM on Claude Sonnet 4.6
// Use 40 RPM (20% safety buffer) → 1500ms between requests
const MIN_INTERVAL_MS = 1500

let lastCallAt = 0
let queue: Promise<void> = Promise.resolve()

export async function acquireRateLimit(): Promise<void> {
  queue = queue.then(async () => {
    const now = Date.now()
    const elapsed = now - lastCallAt
    const waitFor = Math.max(0, MIN_INTERVAL_MS - elapsed)
    if (waitFor > 0) await new Promise(r => setTimeout(r, waitFor))
    lastCallAt = Date.now()
  })
  return queue
}

export async function callAnthropicWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await acquireRateLimit()
      return await fn()
    } catch (err: unknown) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const is429 = msg.includes('429') || msg.includes('rate_limit')
      const isOverload = msg.includes('overloaded') || msg.includes('529')

      if (!is429 && !isOverload) throw err  // non-retryable error
      if (attempt === maxAttempts) break

      // Exponential backoff: 2s, 4s, 8s
      const backoffMs = 2000 * Math.pow(2, attempt - 1)
      console.warn(
        `[rate-limiter] ${is429 ? '429' : 'overload'} attempt ${attempt}/${maxAttempts}, ` +
        `retrying in ${backoffMs}ms`
      )
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}
