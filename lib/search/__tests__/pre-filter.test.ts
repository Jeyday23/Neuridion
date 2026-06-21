import { describe, expect, it } from 'vitest'
import { auditKeywordRelevance } from '@/lib/pipeline/stages/scrape'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

function notice(overrides: Partial<ScrapedFsn> & { external_id: string; title: string }): ScrapedFsn {
  return {
    manufacturer: null,
    product_name: null,
    fsn_date: null,
    source_url: 'https://example.test/notice',
    raw_content: '',
    source_db: 'mhra',
    ...overrides,
  }
}

describe('production keyword pre-filter', () => {
  it('retains a COPRA company-level notice for a COPRA6 profile', () => {
    const result = auditKeywordRelevance(
      [notice({
        external_id: 'copra-notice',
        title: 'Field safety notice for COPRA patient data management software',
        manufacturer: 'COPRA System GmbH',
      })],
      { manufacturer: 'COPRA System GmbH', device_name: 'COPRA6' },
      [],
    )

    expect(result.terms.manufacturer).toEqual(['copra'])
    expect(result.terms.device).toEqual(['copra6', 'copra'])
    expect(result.items.map((item) => item.external_id)).toEqual(['copra-notice'])
    expect(result.counts.deviceMatches).toBe(1)
  })

  it('still rejects unrelated products from the same manufacturer', () => {
    const result = auditKeywordRelevance(
      [
        notice({ external_id: 'micra', title: 'Micra AV safety notice', manufacturer: 'Medtronic' }),
        notice({ external_id: 'minimed', title: 'MiniMed insulin pump notice', manufacturer: 'Medtronic' }),
      ],
      { manufacturer: 'Medtronic', device_name: 'Micra AV' },
      [],
    )

    expect(result.items.map((item) => item.external_id)).toEqual(['micra'])
    expect(result.counts.manufacturerOnlyRejected).toBe(1)
  })
})
