import { describe, it, expect } from 'vitest'
import { extractManufacturerTerms, buildManufacturerSearchTerms } from '../lib/search/manufacturer-terms'

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
  it('device term ≤4 chars is ignored', () => {
    expect(buildManufacturerSearchTerms('Acme Corp', 'Pump')).toEqual(['acme'])
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
