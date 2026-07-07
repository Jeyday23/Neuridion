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
    expect(computeRunStatus(['MHRA: fetch failed at offset 0 — results may be incomplete.'], 150)).toBe('degraded')
  })

  it('returns complete when benign warnings and items = 0', () => {
    expect(computeRunStatus(['FIRECRAWL_API_KEY not set — BfArM fallback unavailable'], 0)).toBe('complete')
    expect(computeRunStatus(['Firecrawl fallback skipped: no credits (HTTP 402)'], 0)).toBe('complete')
    expect(computeRunStatus(['Firecrawl crawl timed out after 120s'], 0)).toBe('complete')
    expect(computeRunStatus(['BfArM primary scraper threw: Error: connect ETIMEDOUT'], 0)).toBe('complete')
    expect(computeRunStatus(['BFARM database was unavailable during this search and returned no results.'], 0)).toBe('complete')
    expect(computeRunStatus(['FDA MAUDE database was unavailable during this search and returned no results.'], 0)).toBe('complete')
    expect(computeRunStatus(['MHRA database was unavailable during this search and returned no results.'], 0)).toBe('complete')
    expect(computeRunStatus(['SWISSMEDIC database was unavailable during this search and returned no results.'], 0)).toBe('complete')
    expect(computeRunStatus(['BfArM: year 2020 is outside the 3-year archive window (2024–2026). Data for this period is unavailable via automated search.'], 0)).toBe('complete')
  })

  it('returns complete when multiple benign warnings and items = 0', () => {
    expect(computeRunStatus([
      'FIRECRAWL_API_KEY not set — BfArM fallback unavailable',
      'BFARM database was unavailable during this search and returned no results.',
      'Firecrawl crawl timed out after 120s',
      'MHRA database was unavailable during this search and returned no results.',
    ], 0)).toBe('complete')
  })

  it('returns complete when fallback coverage was internally verified and warnings are provenance only', () => {
    expect(computeRunStatus([
      'BfArM broad crawl fallback verified requested date-range coverage after earlier fallback warnings.',
    ], 60)).toBe('complete')
  })

  it('keeps AI provider unavailability degraded because classification did not run', () => {
    expect(computeRunStatus([
      'AI relevance review was unavailable because the AI provider rejected the request for billing/authentication reasons; manual PRRC review is required.',
    ], 105)).toBe('degraded')
  })

  it('returns error when data-loss warnings and items = 0', () => {
    expect(computeRunStatus(['scrapeStage failed: Pipeline stage error.'], 0)).toBe('error')
    expect(computeRunStatus(['BfArM HTML structure may have changed — 5/10 items lacked parseable dates'], 0)).toBe('error')
    expect(computeRunStatus(['5 item(s) dropped — date could not be parsed from BfArM HTML'], 0)).toBe('error')
    expect(computeRunStatus(['MHRA: fetch failed at offset 0 — results may be incomplete.'], 0)).toBe('error')
    expect(computeRunStatus(['BfArM: result set capped at 500 items — additional FSNs may exist for this date range.'], 0)).toBe('error')
  })

  it('returns error when mix of benign and data-loss warnings with items = 0', () => {
    expect(computeRunStatus([
      'FIRECRAWL_API_KEY not set — BfArM fallback unavailable',
      'BfArM HTML structure may have changed — 5/10 items lacked parseable dates',
    ], 0)).toBe('error')
  })
})
