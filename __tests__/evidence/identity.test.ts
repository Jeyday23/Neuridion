import { describe, expect, it } from 'vitest'
import { identityConfidence, issuerReferenceKey, normalizeManufacturerKey } from '@/lib/evidence/identity'
import { identityMethodForSourceRecord } from '@/lib/evidence/source-authority'

describe('issuer identity', () => {
  it('uses manufacturer plus reference to avoid cross-issuer reference collisions', () => {
    expect(issuerReferenceKey('B. Braun GmbH', 'FSCA / 2026 / 001'))
      .toBe('bbraun:FSCA-2026-001')
    expect(issuerReferenceKey('Other Ltd', 'FSCA / 2026 / 001'))
      .not.toBe(issuerReferenceKey('B. Braun GmbH', 'FSCA / 2026 / 001'))
  })

  it('does not invent a key when issuer or reference is unavailable', () => {
    expect(issuerReferenceKey(null, 'FSCA-1')).toBeNull()
    expect(issuerReferenceKey('B. Braun', null)).toBeNull()
  })

  it('marks URL-derived identity as explicitly low stability', () => {
    expect(identityConfidence('url_hash_low_stability')).toBeLessThan(0.5)
  })

  it('classifies known generated source identifiers honestly', () => {
    expect(identityMethodForSourceRecord('bfarm', '0123456789abcdef')).toBe('url_hash_low_stability')
    expect(identityMethodForSourceRecord('fda', 'maude-generated-value')).toBe('generated_low_stability')
    expect(identityMethodForSourceRecord('swissmedic', 'Vk_20260101_01')).toBe('authority_reference')
  })

  it('normalizes common company suffixes without erasing the issuer', () => {
    expect(normalizeManufacturerKey('ACME Medical, Inc.')).toBe('acmemedical')
  })
})
