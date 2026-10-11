import { describe, it, expect } from 'vitest'
import type { SourceResultBreakdown } from '@/lib/pipeline/types'
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

  it('returns "error" when a selected source was unavailable', () => {
    expect(computeRunStatus(['BFARM database was unavailable during this search and returned no results.'], 0)).toBe('error')
  })

  it('returns "complete" when no warnings and no items (empty search)', () => {
    expect(computeRunStatus([], 0)).toBe('complete')
  })
})

function source(status: SourceResultBreakdown['status'], name = 'bfarm'): SourceResultBreakdown {
  return {
    source: name, requested_from: '2026-06-01', requested_to: '2026-06-30',
    fresh_fetched: 0, cached_loaded: 0, found_before_filtering: 0,
    after_keyword_signal: 0, rejected_by_keyword_signal: 0,
    status, fresh_outcomes: [], warnings: 0,
  }
}

describe('typed source coverage', () => {
  it('does not label partial acquisition complete when the adapter emits no warnings', () => {
    expect(computeRunStatus([], 10, [source('partial')], ['bfarm'])).toBe('degraded')
  })

  it('retains successful results but degrades a failed selected source', () => {
    expect(computeRunStatus([], 10, [source('complete'), source('failed', 'fda')], ['bfarm', 'fda'])).toBe('degraded')
  })

  it('fails an empty run if any selected source has no outcome', () => {
    expect(computeRunStatus([], 0, [source('empty')], ['bfarm', 'fda'])).toBe('error')
  })

  it('allows verified empty results and successfully recovered fallbacks', () => {
    expect(computeRunStatus([], 0, [source('empty')], ['bfarm'])).toBe('complete')
    expect(computeRunStatus([], 10, [source('complete_with_fallback')], ['bfarm'])).toBe('complete')
  })
})
