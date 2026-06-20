import { describe, expect, it } from 'vitest'
import {
  detectBfarmOutage,
  mergeBfarmFreshness,
} from '@/lib/scrapers/bfarm-rss'
import { scraperResult, type ScrapedFsn } from '@/lib/scrapers/bfarm'

function item(externalId: string): ScrapedFsn {
  return {
    external_id: externalId,
    title: `Notice ${externalId}`,
    manufacturer: null,
    product_name: null,
    fsn_date: '2026-06-19',
    source_url: `https://www.bfarm.de/${externalId}`,
    raw_content: 'Evidence',
    source_db: 'bfarm',
  }
}

describe('BfArM RSS freshness reconciliation', () => {
  it('flags an empty primary when RSS contains recent records', () => {
    const primary = scraperResult([])
    const rss = scraperResult([item('rss-1')], ['freshness only'], { archiveLimitationHit: true })

    expect(detectBfarmOutage(primary, rss)).toBe(true)
    const merged = mergeBfarmFreshness(primary, rss)
    expect(merged.outcome).toBe('partial')
    expect(merged.items).toHaveLength(1)
    expect(merged.diagnostics?.bfarmOutageSuspected).toBe(true)
  })

  it('adds and deduplicates RSS records while primary controls coverage outcome', () => {
    const primary = scraperResult([item('shared'), item('html-only')])
    const rssDuplicate = {
      ...item('rss-guid-differs'),
      source_url: `${item('shared').source_url}?nn=123#document`,
    }
    const rss = scraperResult([rssDuplicate, item('rss-only')], ['freshness only'], { archiveLimitationHit: true })

    const merged = mergeBfarmFreshness(primary, rss)
    expect(merged.items.map((entry) => entry.external_id)).toEqual(['shared', 'html-only', 'rss-only'])
    expect(merged.outcome).toBe('complete')
    expect(merged.warnings).toEqual([])
    expect(merged.diagnostics?.channelItemCounts).toEqual({
      'HTML primary': 2,
      'RSS freshness': 2,
    })
  })

  it('does not turn a healthy primary into partial coverage when RSS is unavailable', () => {
    const primary = scraperResult([item('html-only')])
    const rss = scraperResult([], ['network timeout'], { failed: true })

    const merged = mergeBfarmFreshness(primary, rss)
    expect(merged.outcome).toBe('complete')
    expect(merged.warnings).toContain('network timeout')
    expect(merged.diagnostics?.bfarmRssOutcome).toBe('failed')
  })
})
