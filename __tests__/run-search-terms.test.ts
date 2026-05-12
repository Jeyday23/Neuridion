import { describe, it, expect } from 'vitest'
import { TermsUsedSchema } from '@/lib/pipeline/run-search'

describe('TermsUsed schema validation', () => {
  it('accepts valid terms payload', () => {
    const payload = {
      manufacturer_terms: ['braun'],
      device_terms: ['infusomat'],
      raw_manufacturer: 'B. Braun',
      raw_device_name: 'Infusomat Space',
      term_algorithm_version: '1',
    }
    expect(TermsUsedSchema.parse(payload)).toEqual(payload)
  })

  it('accepts empty terms arrays', () => {
    const payload = {
      manufacturer_terms: [],
      device_terms: [],
      raw_manufacturer: '',
      raw_device_name: '',
      term_algorithm_version: '1',
    }
    expect(TermsUsedSchema.parse(payload)).toEqual(payload)
  })

  it('rejects oversized manufacturer_terms array', () => {
    const payload = {
      manufacturer_terms: Array.from({ length: 11 }, (_, i) => `term${i}`),
      device_terms: [],
      raw_manufacturer: '',
      raw_device_name: '',
      term_algorithm_version: '1',
    }
    expect(() => TermsUsedSchema.parse(payload)).toThrow()
  })

  it('rejects term string exceeding 100 chars', () => {
    const payload = {
      manufacturer_terms: ['a'.repeat(101)],
      device_terms: [],
      raw_manufacturer: '',
      raw_device_name: '',
      term_algorithm_version: '1',
    }
    expect(() => TermsUsedSchema.parse(payload)).toThrow()
  })
})
