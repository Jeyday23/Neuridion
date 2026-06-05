import { describe, it, expect } from 'vitest'
import { matchExpected, computeRecall, measureNoiseDominance, samplePrecision } from '../benchmark/metrics'
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

describe('matchExpected', () => {
  const items: ScrapedFsn[] = [
    makeFsn({ external_id: 'a1', title: 'Siemens MAGNETOM Recall', source_db: 'bfarm' }),
    makeFsn({ external_id: 'a2', title: 'Philips HeartStart Alert', source_db: 'fda' }),
    makeFsn({ external_id: 'a3', title: 'Generic Mask Notice', source_db: 'bfarm' }),
  ]

  it('matches by title_pattern', () => {
    const results = matchExpected(
      [{ source: 'bfarm', title_pattern: 'MAGNETOM' }],
      items,
    )
    expect(results[0].found).toBe(true)
    expect(results[0].matched_item?.external_id).toBe('a1')
  })

  it('matches by external_id', () => {
    const results = matchExpected(
      [{ source: 'fda', external_id: 'a2' }],
      items,
    )
    expect(results[0].found).toBe(true)
  })

  it('returns MISSING when not found', () => {
    const results = matchExpected(
      [{ source: 'bfarm', title_pattern: 'Nonexistent' }],
      items,
    )
    expect(results[0].found).toBe(false)
  })

  it('respects source filter', () => {
    const results = matchExpected(
      [{ source: 'fda', title_pattern: 'MAGNETOM' }],
      items,
    )
    expect(results[0].found).toBe(false)
  })
})

describe('computeRecall', () => {
  it('returns 100% when all found', () => {
    const result = computeRecall([
      { expected: { source: 'bfarm' }, found: true },
      { expected: { source: 'fda' }, found: true },
    ])
    expect(result.rate).toBe(1)
    expect(result.found).toBe(2)
  })

  it('returns 50% when half found', () => {
    const result = computeRecall([
      { expected: { source: 'bfarm' }, found: true },
      { expected: { source: 'fda' }, found: false },
    ])
    expect(result.rate).toBe(0.5)
  })

  it('returns 100% for empty expected list', () => {
    expect(computeRecall([]).rate).toBe(1)
  })
})

describe('measureNoiseDominance', () => {
  const items: ScrapedFsn[] = [
    makeFsn({ external_id: '1', title: 'Pacemaker recall notice' }),
    makeFsn({ external_id: '2', title: 'MRI safety update' }),
    makeFsn({ external_id: '3', title: 'Another pacemaker alert' }),
    makeFsn({ external_id: '4', title: 'Insulin pump warning' }),
  ]

  it('detects noise term counts and percentages', () => {
    const noise = measureNoiseDominance(items, ['pacemaker', 'insulin pump'])
    expect(noise[0].term).toBe('pacemaker')
    expect(noise[0].count).toBe(2)
    expect(noise[0].percentage).toBe(50)
    expect(noise[1].term).toBe('insulin pump')
    expect(noise[1].count).toBe(1)
  })

  it('excludes terms with zero matches', () => {
    const noise = measureNoiseDominance(items, ['defibrillator'])
    expect(noise).toHaveLength(0)
  })
})

describe('samplePrecision', () => {
  const items: ScrapedFsn[] = [
    makeFsn({ external_id: '1', title: 'Siemens MAGNETOM recall', manufacturer: 'Siemens' }),
    makeFsn({ external_id: '2', title: 'Philips toothbrush alert', manufacturer: 'Philips' }),
    makeFsn({ external_id: '3', title: 'Siemens MRI update', manufacturer: 'Siemens' }),
    makeFsn({ external_id: '4', title: 'Random device notice', manufacturer: 'Unknown' }),
  ]

  it('counts items matching manufacturer or device name', () => {
    const result = samplePrecision(items, 'Siemens', 'MAGNETOM')
    expect(result.relevant_looking).toBe(2)
    expect(result.sampled).toBe(4)
    expect(result.rate).toBe(0.5)
  })

  it('returns zero for empty items', () => {
    const result = samplePrecision([], 'Siemens', 'MAGNETOM')
    expect(result.rate).toBe(0)
  })
})
