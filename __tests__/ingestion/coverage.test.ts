import { describe, expect, it } from 'vitest'
import { computeFetchWindow, detectGaps, unionIntervals } from '@/lib/ingestion/coverage'

describe('ingestion coverage math', () => {
  it('merges adjacent and overlapping intervals without mutating input', () => {
    const input = [
      { from: '2026-01-15', to: '2026-01-25' },
      { from: '2026-01-01', to: '2026-01-10' },
      { from: '2026-01-11', to: '2026-01-20' },
    ]
    expect(unionIntervals(input)).toEqual([{ from: '2026-01-01', to: '2026-01-25' }])
    expect(input[0]).toEqual({ from: '2026-01-15', to: '2026-01-25' })
  })

  it('uses a cold-start lookback', () => {
    expect(computeFetchWindow({
      asOfDate: '2026-06-20', covered: [], overlapDays: 14, lookbackDays: 30,
    })).toEqual({ from: '2026-05-21', to: '2026-06-20' })
  })

  it('rescans from the latest covered edge and clamps future coverage', () => {
    expect(computeFetchWindow({
      asOfDate: '2026-06-20',
      covered: [{ from: '2026-01-01', to: '2026-06-10' }],
      overlapDays: 14,
      lookbackDays: 30,
    })).toEqual({ from: '2026-05-27', to: '2026-06-20' })
    expect(computeFetchWindow({
      asOfDate: '2026-06-20',
      covered: [{ from: '2026-01-01', to: '2026-06-25' }],
      overlapDays: 14,
      lookbackDays: 30,
    })).toEqual({ from: '2026-06-06', to: '2026-06-20' })
  })

  it('finds internal and trailing gaps', () => {
    expect(detectGaps([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-03-01', to: '2026-03-31' },
    ], '2026-01-01', '2026-04-30')).toEqual([
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-04-01', to: '2026-04-30' },
    ])
  })

  it('rejects invalid calendar dates and reversed intervals', () => {
    expect(() => unionIntervals([{ from: '2026-02-30', to: '2026-03-01' }])).toThrow('Invalid ISO date')
    expect(() => detectGaps([], '2026-06-20', '2026-06-01')).toThrow('Invalid interval')
  })
})

