import { describe, it, expect } from 'vitest'
import { extractManufacturerTerms, extractDeviceTerms, buildManufacturerSearchTerms, extractCompetitorTokens } from '../lib/search/manufacturer-terms'

describe('extractManufacturerTerms', () => {
  // Examples from spec
  it('"Wernli AG" → ["wernli"]', () => {
    expect(extractManufacturerTerms('Wernli AG')).toEqual(['wernli'])
  })
  it('"Roche Diabetes Care GmbH" → ["roche", "diabetes"]', () => {
    expect(extractManufacturerTerms('Roche Diabetes Care GmbH')).toEqual(['roche', 'diabetes'])
  })
  it('"Siemens Healthineers AG" → ["siemens", "healthineers"]', () => {
    expect(extractManufacturerTerms('Siemens Healthineers AG')).toEqual(['siemens', 'healthineers'])
  })
  it('"B. Braun" → ["braun"] (B filtered by <3 char rule)', () => {
    expect(extractManufacturerTerms('B. Braun')).toEqual(['braun'])
  })
  it('"BBraun" CamelCase splits → ["braun"]', () => {
    expect(extractManufacturerTerms('BBraun')).toEqual(['braun'])
  })
  it('"Medtronic" → ["medtronic"]', () => {
    expect(extractManufacturerTerms('Medtronic')).toEqual(['medtronic'])
  })
  it('"Philips Medical Systems Nederland B.V." → ["philips", "nederland"] (medical/systems are generic)', () => {
    expect(extractManufacturerTerms('Philips Medical Systems Nederland B.V.')).toEqual(['philips', 'nederland'])
  })
  it('"Acme Medical GmbH" → ["acme"] (medical is generic)', () => {
    expect(extractManufacturerTerms('Acme Medical GmbH')).toEqual(['acme'])
  })
  it('"COPRA System GmbH" → ["copra"] (system is generic)', () => {
    expect(extractManufacturerTerms('COPRA System GmbH')).toEqual(['copra'])
  })

  // Edge cases
  it('empty string → []', () => {
    expect(extractManufacturerTerms('')).toEqual([])
  })
  it('whitespace only → []', () => {
    expect(extractManufacturerTerms('   ')).toEqual([])
  })
  it('string that is only legal suffixes → []', () => {
    expect(extractManufacturerTerms('GmbH AG Ltd')).toEqual([])
  })
  it('caps at 3 tokens for long names', () => {
    expect(extractManufacturerTerms('Alpha Beta Gamma Delta Epsilon Corp')).toEqual(['alpha', 'beta', 'gamma'])
  })
  it('strips punctuation chars', () => {
    expect(extractManufacturerTerms('Smith & Jones, Inc.')).toEqual(['smith', 'jones'])
  })
  it('single-char and two-char tokens filtered', () => {
    expect(extractManufacturerTerms('A. Smith Medical')).toEqual(['smith'])
  })
  it('"3M Company" → ["3m"] (short but distinctive)', () => {
    expect(extractManufacturerTerms('3M Company')).toEqual(['3m'])
  })
  it('"GE Healthcare" → ["ge"] (short but distinctive)', () => {
    expect(extractManufacturerTerms('GE Healthcare')).toEqual(['ge'])
  })
  it('"BD Medical" → ["bd"] (short but distinctive)', () => {
    expect(extractManufacturerTerms('BD Medical')).toEqual(['bd'])
  })
  it('"B. Braun Melsungen AG" → ["braun", "melsungen"]', () => {
    expect(extractManufacturerTerms('B. Braun Melsungen AG')).toEqual(['braun', 'melsungen'])
  })
  it('2-char non-distinctive tokens are filtered', () => {
    expect(extractManufacturerTerms('AB Medical GmbH')).toEqual([])
  })
})

describe('extractDeviceTerms', () => {
  it('derives a stable product-family alias from a trailing model digit', () => {
    expect(extractDeviceTerms('COPRA6')).toEqual(['copra6', 'copra'])
  })

  it('does not turn generic model names into device aliases', () => {
    expect(extractDeviceTerms('System6')).toEqual([])
  })
})

describe('buildManufacturerSearchTerms', () => {
  it('no device name returns manufacturer terms', () => {
    expect(buildManufacturerSearchTerms('Wernli AG')).toEqual(['wernli'])
  })
  it('device name adds up to 2 unique terms >4 chars', () => {
    expect(buildManufacturerSearchTerms('Meso Inc', 'MesoScale Reader')).toEqual(['meso', 'mesoscale', 'reader'])
  })
  it('device term already in manufacturer terms is not duplicated', () => {
    // 'acme' is already in mfr terms (medical filtered as generic); 'acme pump' has no new token >4 chars
    expect(buildManufacturerSearchTerms('Acme Medical GmbH', 'Acme Pump')).toEqual(['acme'])
  })
  it('pure-word device term ≤4 chars is ignored', () => {
    expect(buildManufacturerSearchTerms('Acme Corp', 'Pump')).toEqual(['acme'])
  })
  it('alphanumeric model numbers ≥3 chars are kept (780G)', () => {
    expect(buildManufacturerSearchTerms('Medtronic', 'MiniMed 780G Insulin Pump System')).toEqual(
      ['medtronic', 'minimed', '780g']
    )
  })
  it('empty device name returns manufacturer terms', () => {
    expect(buildManufacturerSearchTerms('Roche Diabetes Care GmbH', '')).toEqual(['roche', 'diabetes'])
  })
  it('"wero Swiss protect surgical face mask type IIR" device name drops "swiss", "protect", "surgical"', () => {
    expect(buildManufacturerSearchTerms('Wernli AG', 'wero Swiss protect surgical face mask type IIR')).toEqual(['wernli'])
  })
  it('specific device token like "accu-chek" is appended; "guide" is blocked by GENERIC_DEVICE_WORDS', () => {
    // mfr terms = ['roche','diabetes']; 'guide' is now generic → blocked; 'accu-chek' is still added
    expect(buildManufacturerSearchTerms('Roche Diabetes Care GmbH', 'Accu-Chek Guide')).toEqual(['roche', 'diabetes', 'accu-chek'])
  })
  it('domain words do not dilute the Accu-Chek product signature', () => {
    expect(buildManufacturerSearchTerms(
      'Roche Diabetes Care GmbH',
      'Accu-Chek Blood Glucose Monitoring System',
    )).toEqual(['roche', 'diabetes', 'accu-chek'])
  })
  it('"Micra AV" appends "micra"; "av" is ≤4 chars and filtered', () => {
    expect(buildManufacturerSearchTerms('Medtronic', 'Micra AV')).toEqual(['medtronic', 'micra'])
  })
  it('"MAGNETOM MRI Scanners" — "scanners" blocked, "mri" ≤4 chars, "magnetom" is added', () => {
    expect(buildManufacturerSearchTerms('Siemens Healthineers AG', 'MAGNETOM MRI Scanners')).toEqual(['siemens', 'healthineers', 'magnetom'])
  })
  it('adds up to 2 device terms instead of 1', () => {
    expect(buildManufacturerSearchTerms('Medtronic', 'Cobalt XT CRT-D System')).toEqual(
      ['medtronic', 'cobalt', 'crt-d']
    )
  })
})

describe('extractCompetitorTokens', () => {
  it('filters tokens shorter than 3 chars (except SHORT_BUT_DISTINCTIVE)', () => {
    const result = extractCompetitorTokens([{ name: 'AB Pro Device' }])
    expect(result).not.toContain('ab')
    expect(result).not.toContain('pro')
  })

  it('filters GENERIC_DEVICE_WORDS from competitor names', () => {
    const result = extractCompetitorTokens([{ name: 'CardioSense Pro Medical System' }])
    expect(result).not.toContain('pro')
    expect(result).not.toContain('medical')
    expect(result).not.toContain('system')
    expect(result).toContain('cardiosense')
  })

  it('filters GENERIC_MFR_WORDS from competitor manufacturer field', () => {
    const result = extractCompetitorTokens([{ name: 'Widget', manufacturer: 'Global Healthcare Solutions GmbH' }])
    expect(result).not.toContain('global')
    expect(result).not.toContain('healthcare')
    expect(result).not.toContain('solutions')
    expect(result).toContain('widget')
  })

  it('caps at 3 tokens per competitor name entry', () => {
    const result = extractCompetitorTokens([
      { name: 'Alpha Beta Gamma Delta Epsilon Zeta' },
    ])
    const nameTokens = result.filter(t => ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].includes(t))
    expect(nameTokens.length).toBeLessThanOrEqual(3)
  })

  it('caps at 3 tokens per competitor manufacturer entry', () => {
    const result = extractCompetitorTokens([
      { name: 'Widget', manufacturer: 'Alpha Beta Gamma Delta Epsilon' },
    ])
    const mfrTokens = result.filter(t => ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].includes(t))
    expect(mfrTokens.length).toBeLessThanOrEqual(3)
  })

  it('caps total tokens at 20', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      name: `LongProductName${i} ExtraWord${i} AnotherWord${i} FourthWord${i}`,
      manufacturer: `Manufacturer${i} Division${i} Branch${i}`,
    }))
    const result = extractCompetitorTokens(entries)
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('keeps SHORT_BUT_DISTINCTIVE 2-char tokens', () => {
    const result = extractCompetitorTokens([{ name: '3M Steri-Strip' }])
    expect(result).toContain('3m')
  })

  it('returns empty array for empty input', () => {
    expect(extractCompetitorTokens([])).toEqual([])
  })

  it('skips entries with blank names', () => {
    const result = extractCompetitorTokens([{ name: '', manufacturer: 'Acme' }])
    expect(result).not.toContain('')
    expect(result).toContain('acme')
  })
})
