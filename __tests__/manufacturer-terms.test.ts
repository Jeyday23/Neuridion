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
  it('"B. Braun" → ["braun"] (B filtered by <2 char rule)', () => {
    expect(extractManufacturerTerms('B. Braun')).toEqual(['braun'])
  })
  it('"BBraun" → ["bbraun"]', () => {
    expect(extractManufacturerTerms('BBraun')).toEqual(['bbraun'])
  })
  it('"Medtronic" → ["medtronic"]', () => {
    expect(extractManufacturerTerms('Medtronic')).toEqual(['medtronic'])
  })
  it('"Philips Medical Systems Nederland B.V." → ["philips", "medical"]', () => {
    expect(extractManufacturerTerms('Philips Medical Systems Nederland B.V.')).toEqual(['philips', 'medical'])
  })
  it('"Acme Medical GmbH" → ["acme", "medical"]', () => {
    expect(extractManufacturerTerms('Acme Medical GmbH')).toEqual(['acme', 'medical'])
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
  it('caps at 2 tokens for long names', () => {
    expect(extractManufacturerTerms('Alpha Beta Gamma Delta Epsilon Corp')).toEqual(['alpha', 'beta'])
  })
  it('strips punctuation chars', () => {
    expect(extractManufacturerTerms('Smith & Jones, Inc.')).toEqual(['smith', 'jones'])
  })
  it('single letter token filtered', () => {
    expect(extractManufacturerTerms('A. Smith Medical')).toEqual(['smith', 'medical'])
  })
})

describe('buildManufacturerSearchTerms', () => {
  it('no device name returns manufacturer terms', () => {
    expect(buildManufacturerSearchTerms('Wernli AG')).toEqual(['wernli'])
  })
  it('device name adds unique term >4 chars', () => {
    expect(buildManufacturerSearchTerms('Meso Inc', 'MesoScale Reader')).toEqual(['meso', 'mesoscale'])
  })
  it('device term already in manufacturer terms is not duplicated', () => {
    // 'acme' is already in mfr terms; 'acme pump' has no new token >4 chars
    expect(buildManufacturerSearchTerms('Acme Medical GmbH', 'Acme Pump')).toEqual(['acme', 'medical'])
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
})
