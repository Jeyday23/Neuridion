import { describe, it, expect } from 'vitest'
import { shouldBypassCoverageCache } from '@/lib/pipeline/run-search'

// sync_coverage records "date range was fetched" without recording which
// manufacturer filter was used. A previous search for Siemens populates
// canonical with Siemens items and marks the range covered. A later B. Braun
// search then loads those Siemens items from canonical, applies the braun filter,
// finds 0 matches, and silently returns nothing — while the live BfArM archive
// has plenty of B. Braun items for the same date range.
//
// Fix: any search with manufacturer terms bypasses the coverage cache and does
// a full fresh fetch. Coverage is only recorded for unfiltered (all-items) fetches.

describe('shouldBypassCoverageCache', () => {
  it('returns false for empty search terms — coverage cache is valid for all-items fetches', () => {
    expect(shouldBypassCoverageCache([])).toBe(false)
  })

  it('returns true for a single manufacturer term', () => {
    expect(shouldBypassCoverageCache(['braun'])).toBe(true)
  })

  it('returns true for multiple terms (manufacturer + device)', () => {
    expect(shouldBypassCoverageCache(['braun', 'infusomat'])).toBe(true)
  })

  it('returns true regardless of what the terms are', () => {
    expect(shouldBypassCoverageCache(['siemens', 'symbia'])).toBe(true)
    expect(shouldBypassCoverageCache(['philips'])).toBe(true)
  })
})
