import { describe, expect, it } from 'vitest'
import { canonicalJson, normalizedObservationHash, sha256Hex } from '@/lib/evidence/hash'
import type { NormalizedObservation } from '@/lib/evidence/types'

const observation: NormalizedObservation = {
  source: 'bfarm',
  sourceRecordId: '12345-22',
  authorityRecordId: '00000000-0000-4000-8000-000000000001',
  identityMethod: 'national_reference',
  fscaReference: 'FSCA-2026-1',
  basicUdiDi: null,
  title: 'Sicherheitsinformation',
  manufacturer: 'B. Braun GmbH',
  productName: 'Infusomat',
  fsnDate: '2026-03-01',
  sourceUrl: 'https://www.bfarm.de/example',
  sourcePayloadHash: 'a'.repeat(64),
  parserVersion: 'bfarm@1',
}

describe('canonicalJson', () => {
  it('sorts object keys recursively and normalizes Unicode', () => {
    expect(canonicalJson({ z: { b: 1, a: 'café'.normalize('NFD') }, a: 2 }))
      .toBe(canonicalJson({ a: 2, z: { a: 'café'.normalize('NFC'), b: 1 } }))
  })

  it('rejects values JSON cannot represent consistently', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow('non-finite')
    expect(() => canonicalJson(Symbol('x'))).toThrow('symbol')
  })
})

describe('normalizedObservationHash', () => {
  it('does not treat a parser-version bump as a source or normalized-data change', () => {
    expect(normalizedObservationHash({ ...observation, parserVersion: 'bfarm@2' }))
      .toBe(normalizedObservationHash(observation))
  })

  it('includes identity method and normalized fields', () => {
    expect(normalizedObservationHash({ ...observation, identityMethod: 'url_hash_low_stability' }))
      .not.toBe(normalizedObservationHash(observation))
  })
})

it('computes the SHA-256 known vector', () => {
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

