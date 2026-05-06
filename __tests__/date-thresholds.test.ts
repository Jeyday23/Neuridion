import { describe, it, expect } from 'vitest'
import { daysBetween } from '@/lib/utils/date-chunks'

describe('daysBetween — 1-year boundary', () => {
  it('returns 366 for a 1-year inclusive range', () => {
    // subMonths(2026-05-06, 12) → 2025-05-06; daysBetween includes both endpoints
    expect(daysBetween('2025-05-06', '2026-05-06')).toBe(366)
  })

  it('returns 365 for a 364-day span', () => {
    // One day short of a year
    expect(daysBetween('2025-05-07', '2026-05-06')).toBe(365)
  })
})

// These document the CORRECT threshold contract after the fix.
// The threshold in search-panel.tsx must satisfy all three invariants below.
describe('search length classification thresholds', () => {
  // Threshold constants mirrored from search-panel.tsx — must stay in sync
  const MAX_DAYS = 365 * 3 + 1

  function classify(totalDays: number) {
    const isMediumSearch = totalDays > 90  && totalDays <= 366
    const isLongSearch   = totalDays > 366 && totalDays <= MAX_DAYS
    const isOverLimit    = totalDays > MAX_DAYS
    if (isOverLimit)    return 'over_limit'
    if (isLongSearch)   return 'multi_year'
    if (isMediumSearch) return 'long'
    return 'short'
  }

  it('1-year range (366 days) classifies as long, not multi_year', () => {
    expect(classify(daysBetween('2025-05-06', '2026-05-06'))).toBe('long')
  })

  it('91-day range classifies as long', () => {
    expect(classify(91)).toBe('long')
  })

  it('90-day range classifies as short', () => {
    expect(classify(90)).toBe('short')
  })

  it('367 days classifies as multi_year', () => {
    expect(classify(367)).toBe('multi_year')
  })

  it('MAX_DAYS + 1 classifies as over_limit', () => {
    expect(classify(MAX_DAYS + 1)).toBe('over_limit')
  })
})
