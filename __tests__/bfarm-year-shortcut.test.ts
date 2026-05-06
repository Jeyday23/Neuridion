import { describe, it, expect } from 'vitest'
import { yearToShortcut } from '@/lib/scrapers/bfarm'

describe('yearToShortcut', () => {
  const Y = 2026  // simulate currentYear

  it('returns current_year for currentYear', () => {
    expect(yearToShortcut(2026, Y)).toBe('current_year')
  })

  it('returns lastyear for currentYear - 1', () => {
    expect(yearToShortcut(2025, Y)).toBe('lastyear')
  })

  it('returns penultimateyear for currentYear - 2', () => {
    expect(yearToShortcut(2024, Y)).toBe('penultimateyear')
  })

  it('returns null for years older than currentYear - 2', () => {
    expect(yearToShortcut(2023, Y)).toBeNull()
    expect(yearToShortcut(2020, Y)).toBeNull()
    expect(yearToShortcut(2000, Y)).toBeNull()
  })

  it('returns null for future years', () => {
    expect(yearToShortcut(2027, Y)).toBeNull()
  })
})
