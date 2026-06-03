import { describe, it, expect } from 'vitest'
import { computeRunStatus } from '../../../lib/pipeline/stages/finalize'

describe('computeRunStatus', () => {
  it('returns "complete" when no warnings and items exist', () => {
    expect(computeRunStatus([], 5)).toBe('complete')
  })

  it('returns "degraded" when warnings exist but items also exist', () => {
    expect(computeRunStatus(['BfArM failed'], 5)).toBe('degraded')
  })

  it('returns "error" when data-loss warnings exist and no items', () => {
    expect(computeRunStatus(['scrapeStage failed: Pipeline stage error.'], 0)).toBe('error')
  })

  it('returns "complete" when benign warnings exist and no items', () => {
    expect(computeRunStatus(['BFARM database was unavailable during this search and returned no results.'], 0)).toBe('complete')
  })

  it('returns "complete" when no warnings and no items (empty search)', () => {
    expect(computeRunStatus([], 0)).toBe('complete')
  })
})
