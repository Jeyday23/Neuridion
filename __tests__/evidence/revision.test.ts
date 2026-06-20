import { describe, expect, it } from 'vitest'
import { diffFields, revisionHash, shouldCreateAuthorityRevision } from '@/lib/evidence/revision'

describe('authority revisions', () => {
  it('are created only when the captured source payload changes', () => {
    expect(shouldCreateAuthorityRevision(null, 'a')).toBe(true)
    expect(shouldCreateAuthorityRevision('a', 'a')).toBe(false)
    expect(shouldCreateAuthorityRevision('a', 'b')).toBe(true)
  })

  it('bind the chain to the previous revision without delimiter ambiguity', () => {
    const base = {
      authorityRecordId: 'authority',
      revisionNumber: 2,
      sourcePayloadHash: 'payload',
      observationId: 'observation',
    }
    expect(revisionHash({ ...base, previousRevisionHash: 'first' }))
      .not.toBe(revisionHash({ ...base, previousRevisionHash: 'second' }))
  })

  it('diffs nested values deterministically', () => {
    expect(diffFields({ a: { b: 1 }, stable: null }, { a: { b: 2 }, stable: null }))
      .toEqual({ a: { from: { b: 1 }, to: { b: 2 } } })
  })
})

