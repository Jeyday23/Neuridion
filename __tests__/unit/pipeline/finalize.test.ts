import { describe, it, expect } from 'vitest'
import { computeRunStatus } from '../../../lib/pipeline/stages/finalize'

describe('computeRunStatus', () => {
  it('returns "complete" when no warnings and items exist', () => {
    expect(computeRunStatus([], 5)).toBe('complete')
  })

  it('returns "degraded" when warnings exist but items also exist', () => {
    expect(computeRunStatus(['BfArM failed'], 5)).toBe('degraded')
  })

  it('returns "error" when warnings exist and no items', () => {
    expect(computeRunStatus(['All sources failed'], 0)).toBe('error')
  })

  it('returns "complete" when no warnings and no items (empty search)', () => {
    expect(computeRunStatus([], 0)).toBe('complete')
  })
})
