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

  it('does not return competitor-only records as product PRRC candidates', () => {
    const result = auditKeywordRelevance(
      [
        notice({
          external_id: 'magnetom',
          title: 'MAGNETOM VIDA safety notice',
          manufacturer: 'Siemens Healthineers AG',
        }),
        notice({
          external_id: 'signa',
          title: 'SIGNA MRI system safety notice',
          manufacturer: 'GE Healthcare',
        }),
        notice({
          external_id: 'pacemaker',
          title: 'MRI compatible pacemaker safety notice',
          manufacturer: 'Other Medical Inc',
        }),
      ],
      { manufacturer: 'Siemens Healthineers', device_name: 'MAGNETOM' },
      ['signa', 'mri', 'ge', 'philips'],
    )

    expect(result.items.map((item) => item.external_id)).toEqual(['magnetom'])
    expect(result.counts.domainOnlyRejected).toBe(1)
  })

  it('requires the named product signature for FDA manufacturer-domain records', () => {
    const result = auditKeywordRelevance(
      [
        notice({
          external_id: 'accu-chek',
          title: 'ACCU-CHEK GUIDE — Malfunction',
          manufacturer: 'Roche Diabetes Care',
          product_name: 'ACCU-CHEK GUIDE',
          raw_content: 'Blood glucose monitoring system',
          source_db: 'fda',
        }),
        notice({
          external_id: 'other-roche-meter',
          title: 'Other glucose meter — Malfunction',
          manufacturer: 'Roche Diabetes Care',
          product_name: 'Other glucose meter',
          raw_content: 'Blood glucose monitoring system',
          source_db: 'fda',
        }),
        notice({
          external_id: 'accu-check-variant',
          title: 'ACCU-CHECK AVIVA PLUS TEST STRIPS — Malfunction',
          manufacturer: 'Roche Diabetes Care',
          product_name: 'ACCU-CHECK AVIVA PLUS TEST STRIPS',
          raw_content: 'Blood glucose test strips',
          source_db: 'fda',
        }),
      ],
      { manufacturer: 'Roche Diabetes Care', device_name: 'Accu-Chek Blood Glucose Monitoring System' },
      [],
    )

    expect(result.terms.device).toEqual(['accu-chek'])
    expect(result.items.map((item) => item.external_id)).toEqual([
      'accu-chek',
      'accu-check-variant',
    ])
  })
})
