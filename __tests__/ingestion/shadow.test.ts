import { describe, expect, it } from 'vitest'
import { compareSets } from '@/lib/ingestion/shadow'

describe('shadow set comparison', () => {
  it('compares stable source record IDs rather than URLs', () => {
    const result = compareSets(
      [{ external_id: 'a' }, { external_id: 'b' }],
      [{ external_id: 'a' }, { external_id: 'b' }],
    )
    expect(result).toEqual({ onlyLive: 0, onlyMirror: 0, common: 2, agreement: 1 })
  })

  it('reports mirror gaps using Jaccard agreement', () => {
    const result = compareSets(
      [{ external_id: 'a' }, { external_id: 'b' }],
      [{ external_id: 'a' }, { external_id: 'c' }],
    )
    expect(result).toEqual({ onlyLive: 1, onlyMirror: 1, common: 1, agreement: 1 / 3 })
  })

  it('treats two empty sets as agreement without claiming coverage', () => {
    expect(compareSets([], []).agreement).toBe(1)
  })
})

