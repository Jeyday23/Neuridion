import { describe, expect, it } from 'vitest'
import { scraperResult, type ScrapedFsn } from '@/lib/scrapers/bfarm'

const item: ScrapedFsn = {
  external_id: 'record-1',
  title: 'Safety notice',
  manufacturer: 'Acme',
  product_name: 'Device',
  fsn_date: '2026-06-01',
  source_url: 'https://example.test/record-1',
  raw_content: 'Safety notice',
  source_db: 'test',
}

describe('enterprise scraper result contract', () => {
  it('distinguishes complete, empty, partial, and failed retrievals', () => {
    expect(scraperResult([item]).outcome).toBe('complete')
    expect(scraperResult([]).outcome).toBe('empty')
    expect(scraperResult([item], ['truncated']).outcome).toBe('partial')
    expect(scraperResult([], ['unavailable'], { failed: true }).outcome).toBe('failed')
  })

  it('treats a known archive limitation as partial coverage', () => {
    const result = scraperResult([], ['archive unavailable'], { archiveLimitationHit: true })
    expect(result.outcome).toBe('partial')
    expect(result.archiveLimitationHit).toBe(true)
  })
})
