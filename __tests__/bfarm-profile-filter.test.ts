import { describe, it, expect } from 'vitest'
import { auditKeywordRelevance, filterByKeywordRelevance } from '@/lib/pipeline/stages/scrape'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

function makeFsn(overrides: Partial<ScrapedFsn> & { external_id: string; title: string }): ScrapedFsn {
  return {
    manufacturer: null,
    product_name: null,
    fsn_date: null,
    source_url: 'https://example.com',
    raw_content: '',
    source_db: 'bfarm',
    ...overrides,
  }
}

const MIXED_ITEMS: ScrapedFsn[] = [
  makeFsn({ external_id: '1', title: 'Rückruf: MAGNETOM Avanto von Siemens Healthineers', manufacturer: 'Siemens Healthineers' }),
  makeFsn({ external_id: '2', title: 'Sicherheitshinweis: Infusomat Space von B. Braun', manufacturer: 'B. Braun Melsungen AG' }),
  makeFsn({ external_id: '3', title: 'Kundeninfo: OP-Masken Typ IIR', manufacturer: null }),
  makeFsn({ external_id: '4', title: 'Rückruf: Siemens SOMATOM CT Scanner', manufacturer: 'Siemens Healthineers' }),
  makeFsn({ external_id: '5', title: 'Sicherheitshinweis: Medtronic Micra AV Herzschrittmacher', manufacturer: 'Medtronic' }),
  makeFsn({ external_id: '6', title: 'Kundeninfo: Philips HeartStart Defibrillator', manufacturer: 'Philips' }),
]

describe('filterByKeywordRelevance', () => {
  it('explains a zero-result filter without treating acquisition as empty', () => {
    const audit = auditKeywordRelevance(
      [
        makeFsn({ external_id: '1', title: 'Acme surgical instrument', manufacturer: 'Acme Ltd' }),
        makeFsn({ external_id: '2', title: 'Unrelated infusion pump', manufacturer: 'Other Ltd' }),
      ],
      { manufacturer: 'Acme Ltd', device_name: 'CardioWidget 7' },
      [],
    )

    expect(audit.items).toEqual([])
    expect(audit.counts).toMatchObject({
      total: 2,
      kept: 0,
      manufacturerMatches: 1,
      deviceMatches: 0,
      manufacturerOnlyRejected: 1,
      noSignalRejected: 1,
    })
    expect(audit.terms.manufacturer).toEqual(['acme'])
    expect(audit.terms.device).toEqual(['cardiowidget'])
  })

  it('keeps manufacturer+device (tier 0) items', () => {
    const result = filterByKeywordRelevance(
      MIXED_ITEMS,
      { manufacturer: 'Siemens Healthineers', device_name: 'MAGNETOM Avanto' },
      [],
    )
    expect(result.map(i => i.external_id)).toContain('1')
  })

  it('drops manufacturer-only items when device/domain terms exist (Siemens CT for MAGNETOM search)', () => {
    const result = filterByKeywordRelevance(
      MIXED_ITEMS,
      { manufacturer: 'Siemens Healthineers', device_name: 'MAGNETOM Avanto' },
      [],
    )
    const ids = result.map(i => i.external_id)
    expect(ids).not.toContain('4')
  })

  it('drops items with no keyword match', () => {
    const result = filterByKeywordRelevance(
      MIXED_ITEMS,
      { manufacturer: 'Siemens Healthineers', device_name: 'MAGNETOM Avanto' },
      [],
    )
    const ids = result.map(i => i.external_id)
    expect(ids).not.toContain('3')
    expect(ids).not.toContain('5')
    expect(ids).not.toContain('6')
  })

  it('drops manufacturer-only Medtronic wrong-domain noise for Micra', () => {
    const items = [
      makeFsn({
        external_id: 'pump-1',
        title: 'MiniMed 780G insulin pump malfunction',
        manufacturer: 'Medtronic Minimed',
      }),
      makeFsn({
        external_id: 'micra-1',
        title: 'Micra AV leadless pacemaker safety notice',
        manufacturer: 'Medtronic',
      }),
    ]

    const result = filterByKeywordRelevance(
      items,
      { manufacturer: 'Medtronic', device_name: 'Micra AV' },
      [],
    )

    expect(result.map(i => i.external_id)).toEqual(['micra-1'])
  })

  it('drops manufacturer-only generic Medtronic item when Micra has device terms', () => {
    const items = [
      makeFsn({
        external_id: 'generic-1',
        title: 'Generic device update',
        manufacturer: 'Medtronic Inc.',
      }),
    ]

    const result = filterByKeywordRelevance(
      items,
      { manufacturer: 'Medtronic', device_name: 'Micra AV' },
      [],
    )

    expect(result).toHaveLength(0)
  })

  it('does not return competitor-only items as product PRRC candidates', () => {
    const items = [
      makeFsn({
        external_id: 'competitor-good',
        title: 'Leadless pacemaker programmer issue',
        manufacturer: 'Abbott',
      }),
      makeFsn({
        external_id: 'competitor-bad',
        title: 'Insulin pump reservoir issue',
        manufacturer: 'Abbott',
      }),
    ]

    const result = filterByKeywordRelevance(
      items,
      { manufacturer: 'Medtronic', device_name: 'Micra AV' },
      ['abbott'],
    )

    expect(result.map(i => i.external_id)).toEqual([])
  })

  it('keeps manufacturer-only only when profile has no usable device/domain terms', () => {
    const items = [
      makeFsn({
        external_id: 'mfr-1',
        title: 'Generic device update',
        manufacturer: 'Medtronic Inc.',
      }),
    ]

    const result = filterByKeywordRelevance(
      items,
      { manufacturer: 'Medtronic', device_name: 'Device' },
      [],
    )

    expect(result.map(i => i.external_id)).toEqual(['mfr-1'])
  })

  it('is case insensitive', () => {
    const items = [
      makeFsn({ external_id: 'a', title: 'SIEMENS MAGNETOM MRI recall', manufacturer: 'SIEMENS' }),
    ]
    const result = filterByKeywordRelevance(
      items,
      { manufacturer: 'siemens healthineers', device_name: 'Magnetom' },
      [],
    )
    expect(result).toHaveLength(1)
  })

  it('matches against raw_content field', () => {
    const items = [
      makeFsn({ external_id: 'a', title: 'Kundeninfo #123', raw_content: 'Betrifft MAGNETOM MRI Systeme', manufacturer: 'Siemens' }),
    ]
    const result = filterByKeywordRelevance(
      items,
      { manufacturer: 'Siemens', device_name: 'MAGNETOM' },
      [],
    )
    expect(result).toHaveLength(1)
  })

  it('returns all items when profile has no meaningful terms', () => {
    const result = filterByKeywordRelevance(
      MIXED_ITEMS,
      { manufacturer: 'AG', device_name: 'Medical Device' },
      [],
    )
    expect(result).toHaveLength(MIXED_ITEMS.length)
  })

  it('returns empty array when no items match', () => {
    const result = filterByKeywordRelevance(
      MIXED_ITEMS,
      { manufacturer: 'Stryker', device_name: 'LIFEPAK' },
      [],
    )
    expect(result).toHaveLength(0)
  })

  it('handles empty items array', () => {
    const result = filterByKeywordRelevance(
      [],
      { manufacturer: 'Siemens', device_name: 'MAGNETOM' },
      [],
    )
    expect(result).toHaveLength(0)
  })

  it('reduces a realistic BfArM-sized result set with domain awareness', () => {
    const bulkItems: ScrapedFsn[] = Array.from({ length: 200 }, (_, i) =>
      makeFsn({
        external_id: `bulk-${i}`,
        title: `Generic FSN #${i} about random devices`,
        manufacturer: `Vendor ${i}`,
      }),
    )
    bulkItems.push(
      makeFsn({ external_id: 'target-1', title: 'Infusomat Space Rückruf', manufacturer: 'B. Braun' }),
      makeFsn({ external_id: 'target-2', title: 'Infusion pump update von B. Braun Melsungen', manufacturer: 'B. Braun Melsungen AG' }),
      makeFsn({ external_id: 'noise-1', title: 'Aesculap surgical instrument recall', manufacturer: 'B. Braun Melsungen AG' }),
    )
    const result = filterByKeywordRelevance(
      bulkItems,
      { manufacturer: 'B. Braun Melsungen AG', device_name: 'Infusomat Space' },
      [],
    )
    expect(result.length).toBeLessThan(10)
    const ids = result.map(i => i.external_id)
    expect(ids).toContain('target-1')
    expect(ids).not.toContain('target-2')
    expect(ids).not.toContain('noise-1')
  })

  it('catches both cached and fresh items at pipeline boundary', () => {
    const freshItems = [
      makeFsn({ external_id: 'fresh-1', title: 'Siemens MAGNETOM MRI recall' }),
    ]
    const cachedItems = [
      makeFsn({ external_id: 'cached-1', title: 'Unrelated device notice' }),
      makeFsn({ external_id: 'cached-2', title: 'Siemens MRI scanner update' }),
    ]
    const combined = [...freshItems, ...cachedItems]
    const result = filterByKeywordRelevance(
      combined,
      { manufacturer: 'Siemens Healthineers', device_name: 'MAGNETOM' },
      [],
    )
    expect(result.map(i => i.external_id)).toContain('fresh-1')
    expect(result.map(i => i.external_id)).not.toContain('cached-2')
    expect(result.map(i => i.external_id)).not.toContain('cached-1')
  })
})
