import { describe, it, expect } from 'vitest'
import { computeRunStatus } from '@/lib/pipeline/stages/finalize'

describe('computeRunStatus', () => {
  it('returns complete when no warnings and items > 0', () => {
    expect(computeRunStatus([], 179)).toBe('complete')
  })

  it('returns complete when no warnings and items = 0', () => {
    expect(computeRunStatus([], 0)).toBe('complete')
  })

  it('returns degraded when warnings exist and items > 0', () => {
    expect(computeRunStatus(['MHRA database was unavailable during this search and returned no results.'], 150)).toBe('degraded')
  })

  it('returns complete when warnings are info-only and items = 0', () => {
    expect(computeRunStatus(['BfArM returned 0 results for this date range'], 0)).toBe('complete')
    expect(computeRunStatus(['No matching FSNs found for this device'], 0)).toBe('complete')
  })

  it('returns error when non-info warnings and items = 0', () => {
    expect(computeRunStatus(['scrapeStage failed: Pipeline stage error.'], 0)).toBe('error')
    expect(computeRunStatus(['MHRA database was unavailable during this search and returned no results.'], 0)).toBe('error')
  })
})
