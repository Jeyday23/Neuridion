import { describe, expect, it } from 'vitest'
import { assessScraperResult } from '@/app/api/worker/scraper-health/route'
import { scraperResult } from '@/lib/scrapers/bfarm'

describe('scraper health authority diagnostics', () => {
  it('labels FDA as signal evidence and does not fabricate ingestion freshness', () => {
    const health = assessScraperResult('fda', scraperResult([], []), 25)
    expect(health).toMatchObject({
      healthy: true,
      evidenceClass: 'adverse_event_signal',
      completenessSemantics: 'interactive_signal_query_not_coverage',
      freshnessTargetHours: null,
      freshnessLagHours: null,
      freshnessMeasurement: 'not_available_from_live_probe',
      fuzzyReconcileRatio: null,
    })
  })

  it('emits MHRA parity as a diagnostic without applying an unvalidated threshold', () => {
    const result = scraperResult([], [], {
      diagnostics: {
        mhraParityDelta: 0.8,
        channelItemCounts: { Excel: 10, 'GOV.UK API': 2 },
      },
    })
    const health = assessScraperResult('mhra', result, 50)
    expect(health.healthy).toBe(true)
    expect(health.parityDelta).toBe(0.8)
    expect(health.channelItemCounts).toEqual({ Excel: 10, 'GOV.UK API': 2 })
  })

  it('degrades partial acquisition outcomes', () => {
    const health = assessScraperResult(
      'bfarm',
      scraperResult([], ['pagination warning']),
      100,
    )
    expect(health.healthy).toBe(false)
    expect(health.outcome).toBe('partial')
  })
})

