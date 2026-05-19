import { createHmac, timingSafeEqual } from 'node:crypto'

export function safeCompare(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'neuridion-safe-compare-v1').update(a).digest()
  const hb = createHmac('sha256', 'neuridion-safe-compare-v1').update(b).digest()
  return timingSafeEqual(ha, hb)
}
