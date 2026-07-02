import { describe, expect, it } from 'vitest'
import { groundValues } from '@/lib/extraction/ai'
import { emptyFields } from '@/lib/extraction/types'

describe('groundValues', () => {
  const source = 'Affected LOT 24C09B77 only. REF 8713060. Required action: quarantine product.'

  it('keeps values literally present in the source text', () => {
    const result = groundValues({ ...emptyFields(), lotNumbers: ['24C09B77'], refNumbers: ['8713060'] }, source)
    expect(result.fields.lotNumbers).toEqual(['24C09B77'])
    expect(result.fields.refNumbers).toEqual(['8713060'])
    expect(result.dropped).toEqual([])
  })

  it('drops hallucinated values not present in source text', () => {
    const result = groundValues({ ...emptyFields(), lotNumbers: ['24C09B77', 'FAKE-LOT-666'] }, source)
    expect(result.fields.lotNumbers).toEqual(['24C09B77'])
    expect(result.dropped).toEqual(['FAKE-LOT-666'])
  })

  it('does not keep action text unless the exact action appears in the source text', () => {
    const result = groundValues({ ...emptyFields(), actionRequired: 'destroy all devices immediately' }, source)
    expect(result.fields.actionRequired).toBeNull()
    expect(result.dropped).toEqual(['destroy all devices immediately'])
  })
})
