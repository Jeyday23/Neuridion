// ── Sonnet (claude-sonnet-4-6) ────────────────────────────────────────────────
// Org limit: 50 RPM. Use 40 RPM (20% safety buffer) → 1500ms between requests.
const SONNET_MIN_MS = 1500

let lastSonnetAt = 0
let sonnetQueue: Promise<void> = Promise.resolve()

async function acquireSonnet(): Promise<void> {
  sonnetQueue = sonnetQueue.then(async () => {
    const wait = Math.max(0, SONNET_MIN_MS - (Date.now() - lastSonnetAt))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastSonnetAt = Date.now()
  })
  return sonnetQueue
}

// ── Haiku (claude-haiku-4-5-20251001) ────────────────────────────────────────
// Haiku has higher org limits. Use 80 RPM (conservative) → 750ms between requests.
const HAIKU_MIN_MS = 750

let lastHaikuAt = 0
let haikuQueue: Promise<void> = Promise.resolve()

async function acquireHaiku(): Promise<void> {
  haikuQueue = haikuQueue.then(async () => {
    const wait = Math.max(0, HAIKU_MIN_MS - (Date.now() - lastHaikuAt))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastHaikuAt = Date.now()
  })
  return haikuQueue
}

// ── Shared retry wrapper ──────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  acquire: () => Promise<void>,
  label: string,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await acquire()
      return await fn()
    } catch (err: unknown) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const is429     = msg.includes('429') || msg.includes('rate_limit')
      const isOverload = msg.includes('overloaded') || msg.includes('529')

      if (!is429 && !isOverload) throw err   // non-retryable
      if (attempt === maxAttempts) break

      const backoffMs = 2000 * Math.pow(2, attempt - 1)
      console.error('[rate-limiter]',
        `${label} ${is429 ? '429' : 'overload'} ` +
        `attempt ${attempt}/${maxAttempts}, retrying in ${backoffMs}ms`,
      )
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

// ── Public API ────────────────────────────────────────────────────────────────

export function callAnthropicWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  return withRetry(fn, acquireSonnet, 'sonnet', maxAttempts)
}

export function callHaikuWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  return withRetry(fn, acquireHaiku, 'haiku', maxAttempts)
}
