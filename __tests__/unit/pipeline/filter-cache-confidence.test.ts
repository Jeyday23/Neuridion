import { describe, expect, it } from 'vitest'
import { normalizeCachedConfidence } from '@/lib/pipeline/stages/filter'

describe('normalizeCachedConfidence', () => {
  it('converts cached integer percentages to persisted confidence fractions', () => {
    expect(normalizeCachedConfidence('85')).toBe(0.85)
    expect(normalizeCachedConfidence(100)).toBe(1)
    expect(normalizeCachedConfidence(0)).toBe(0)
  })

  it('keeps already-fractional confidence values in range', () => {
    expect(normalizeCachedConfidence('0.92')).toBe(0.92)
    expect(normalizeCachedConfidence(null)).toBeNull()
  })
})
