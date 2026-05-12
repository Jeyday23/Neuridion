import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const TermsUsedSchema = z.object({
  manufacturer_terms: z.array(z.string().max(100)).max(10),
  device_terms: z.array(z.string().max(100)).max(10),
  raw_manufacturer: z.string().max(500),
  raw_device_name: z.string().max(500),
  term_algorithm_version: z.string().max(10),
})

export type TermsUsed = z.infer<typeof TermsUsedSchema>

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
