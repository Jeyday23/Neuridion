import { describe, it, expect } from 'vitest'
import { matchExpected, computeRecall, measureNoiseDominance, samplePrecision } from '../benchmark/metrics'
import { MissingFixtureError } from '../benchmark/runner'
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

  it('returns null rate for empty expected list (N/A, not 100%)', () => {
    const result = computeRecall([])
    expect(result.rate).toBeNull()
    expect(result.found).toBe(0)
    expect(result.expected).toBe(0)
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

describe('fixture mode fail-closed', () => {
  it('MissingFixtureError contains profile and source info', () => {
    const err = new MissingFixtureError('magnetom-mri', 'bfarm')
    expect(err.message).toContain('magnetom-mri')
    expect(err.message).toContain('bfarm')
    expect(err.message).toContain('npm run benchmark:live')
    expect(err.name).toBe('MissingFixtureError')
  })
})

describe('summary averaging excludes N/A profiles', () => {
  it('profiles with null recall rate should not inflate average', () => {
    const profiles = [
      { recall: { found: 2, expected: 3, rate: 2 / 3 } },
      { recall: { found: 0, expected: 0, rate: null } },
    ]

    const measurable = profiles.filter((p) => p.recall.rate != null)
    const avgRecall = measurable.length > 0
      ? measurable.reduce((sum, p) => sum + (p.recall.rate ?? 0), 0) / measurable.length
      : null

    expect(avgRecall).toBeCloseTo(2 / 3)
    expect(measurable).toHaveLength(1)
  })

  it('returns null when all profiles have N/A recall', () => {
    const profiles = [
      { recall: { found: 0, expected: 0, rate: null } },
      { recall: { found: 0, expected: 0, rate: null } },
    ]

    const measurable = profiles.filter((p) => p.recall.rate != null)
    const avgRecall = measurable.length > 0
      ? measurable.reduce((sum, p) => sum + (p.recall.rate ?? 0), 0) / measurable.length
      : null

    expect(avgRecall).toBeNull()
  })
})

describe('report labeling', () => {
  it('precision column header says "Keyword Precision Sample"', () => {
    const headerLine = '| Profile | Scraped | Recall | Keyword Precision Sample | Duration |'
    expect(headerLine).toContain('Keyword Precision Sample')
    expect(headerLine).not.toMatch(/\| Precision \|/)
  })

  it('summary metric says "Average Keyword Precision Sample"', () => {
    const summaryLine = '| Average Keyword Precision Sample |'
    expect(summaryLine).toContain('Keyword Precision Sample')
  })
})
