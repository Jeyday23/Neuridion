import { describe, expect, it } from 'vitest'
import { isCertifiableFixture } from '@/benchmark/runner'
import type { ScraperOutcome, ScraperResult } from '@/lib/scrapers/bfarm'

function result(outcome: ScraperOutcome): ScraperResult {
  return { items: [], warnings: [], outcome }
}

describe('benchmark fixture safety', () => {
  it.each(['complete', 'empty'] as const)('accepts %s source coverage', (outcome) => {
    expect(isCertifiableFixture(result(outcome))).toBe(true)
  })

  it.each(['partial', 'failed'] as const)('rejects %s source coverage', (outcome) => {
    expect(isCertifiableFixture(result(outcome))).toBe(false)
  })
})
