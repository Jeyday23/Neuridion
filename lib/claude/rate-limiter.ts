class ConcurrentRateLimiter {
  private readonly maxConcurrent: number
  private readonly rpmLimit: number
  private readonly label: string
  private readonly maxQueueDepth: number

  private activeCalls = 0
  private callTimestamps: number[] = []
  private waitQueue: Array<() => void> = []

  constructor(label: string, maxConcurrent: number, rpmLimit: number, maxQueueDepth = 50) {
    this.label = label
    this.maxConcurrent = maxConcurrent
    this.rpmLimit = rpmLimit
    this.maxQueueDepth = maxQueueDepth
  }

  async acquire(): Promise<() => void> {
    if (this.waitQueue.length >= this.maxQueueDepth) {
      throw new Error(`Rate limiter queue full (${this.label})`)
    }

    // Wait for a concurrent slot to open
    while (this.activeCalls >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve)
      })
    }

    // Wait for RPM budget — sliding window over last 60s
    const now = Date.now()
    this.callTimestamps = this.callTimestamps.filter((ts) => now - ts < 60_000)

    while (this.callTimestamps.length >= this.rpmLimit) {
      const oldest = this.callTimestamps[0]
      const waitMs = 60_000 - (Date.now() - oldest) + 50
      if (waitMs > 0) {
        await new Promise<void>((r) => setTimeout(r, waitMs))
      }
      const fresh = Date.now()
      this.callTimestamps = this.callTimestamps.filter((ts) => fresh - ts < 60_000)
    }

    this.activeCalls++
    this.callTimestamps.push(Date.now())

    let released = false
    const release = (): void => {
      if (released) return
      released = true
      this.activeCalls--
      const next = this.waitQueue.shift()
      if (next) next()
    }

    return release
  }
}

const sonnetLimiter = new ConcurrentRateLimiter('sonnet', 3, 45)
const haikuLimiter  = new ConcurrentRateLimiter('haiku', 5, 70)

async function withRetry<T>(
  fn: () => Promise<T>,
  limiter: ConcurrentRateLimiter,
  label: string,
  maxAttempts: number,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const release = await limiter.acquire()
    try {
      const result = await fn()
      release()
      return result
    } catch (err: unknown) {
      release()
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const is429     = msg.includes('429') || msg.includes('rate_limit')
      const isOverload = msg.includes('overloaded') || msg.includes('529')

      if (!is429 && !isOverload) throw err
      if (attempt === maxAttempts) break

      const backoffMs = 2000 * Math.pow(2, attempt - 1)
      console.error('[rate-limiter]',
        `${label} ${is429 ? '429' : 'overload'} ` +
        `attempt ${attempt}/${maxAttempts}, retrying in ${backoffMs}ms`,
      )
      await new Promise<void>((r) => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

export function callAnthropicWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  return withRetry(fn, sonnetLimiter, 'sonnet', maxAttempts)
}

export function callHaikuWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  return withRetry(fn, haikuLimiter, 'haiku', maxAttempts)
}
