import { describe, it, expect } from 'vitest'
import {
  getFsnExternalId,
  getProfileFingerprint,
  hasManufacturerTokenMatch,
  sanitizePii,
  piiScrubForSource,
  FILTER_PROMPT_VERSION,
  type FsnContext,
  type ProfileContext,
} from '@/lib/claude/filter-pipeline'

const fsn = (over: Partial<FsnContext> = {}): FsnContext => ({
  title: 'Sicherheitsinformation zu Infusomat Space von B. Braun Melsungen AG',
  manufacturer: 'B. Braun Melsungen AG',
  raw_content: 'BfArM reference: 12345/26\nInfusomat Space infusion pump',
  fsn_date: '2026-06-19',
  source_db: 'bfarm',
  ...over,
})

const profile = (over: Partial<ProfileContext> = {}): ProfileContext => ({
  device_name: 'Infusomat Space',
  manufacturer: 'B. Braun',
  intended_use: null,
  emdn_code: null,
  device_class: 'IIb',
  ...over,
})

describe('getFsnExternalId — content-aware cache key', () => {
  it('is stable for identical FSNs', () => {
    expect(getFsnExternalId(fsn())).toBe(getFsnExternalId(fsn()))
  })

  it('changes when raw_content changes (amended FSN must re-evaluate)', () => {
    const original = getFsnExternalId(fsn())
    const amended = getFsnExternalId(fsn({ raw_content: 'AMENDED: recall scope extended to all lots' }))
    expect(amended).not.toBe(original)
  })

  it('changes when title changes', () => {
    expect(getFsnExternalId(fsn({ title: 'Different notice' }))).not.toBe(getFsnExternalId(fsn()))
  })

  it('returns a 32-char hex id', () => {
    expect(getFsnExternalId(fsn())).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('getProfileFingerprint — prompt-version salted', () => {
  it('is stable for the same profile and default prompt version', () => {
    expect(getProfileFingerprint(profile())).toBe(getProfileFingerprint(profile()))
  })

  it('changes when the prompt version changes (prompt improvements invalidate cache)', () => {
    expect(getProfileFingerprint(profile(), 'fp-v1')).not.toBe(getProfileFingerprint(profile(), 'fp-v2'))
  })

  it('uses FILTER_PROMPT_VERSION by default', () => {
    expect(getProfileFingerprint(profile())).toBe(getProfileFingerprint(profile(), FILTER_PROMPT_VERSION))
  })
})

describe('hasManufacturerTokenMatch — deterministic pre-filter guard', () => {
  it('matches when a profile manufacturer token appears in the FSN title', () => {
    expect(hasManufacturerTokenMatch(fsn(), profile())).toBe(true)
  })

  it('matches legal-name variants (B. Braun vs B. Braun Melsungen AG)', () => {
    expect(hasManufacturerTokenMatch(
      fsn({ manufacturer: 'B.Braun Melsungen AG', title: 'Dringende Sicherheitsinformation' }),
      profile({ manufacturer: 'BBraun' }),
    )).toBe(true)
  })

  it('matches tokens found only in raw_content', () => {
    expect(hasManufacturerTokenMatch(
      fsn({ title: 'Urgent field safety notice', manufacturer: '', raw_content: 'Distributed by Braun subsidiaries' }),
      profile(),
    )).toBe(true)
  })

  it('does not match an unrelated manufacturer', () => {
    expect(hasManufacturerTokenMatch(
      fsn({ title: 'Dental implant recall', manufacturer: 'Straumann AG', raw_content: 'dental implant systems' }),
      profile(),
    )).toBe(false)
  })

  it('returns false when the profile manufacturer yields no usable tokens', () => {
    expect(hasManufacturerTokenMatch(fsn(), profile({ manufacturer: '' }))).toBe(false)
  })
})

describe('sanitizePii — must not eat device identifiers', () => {
  it('preserves a GTIN-14 UDI', () => {
    expect(sanitizePii('UDI: (01)04046963312345')).toContain('(01)04046963312345')
  })

  it('preserves a long unseparated lot number', () => {
    expect(sanitizePii('Lot 123456789012 affected')).toContain('123456789012')
  })

  it('preserves catalog number pairs', () => {
    expect(sanitizePii('REF 8713060 8713061')).toContain('8713060 8713061')
  })

  it('still redacts separated US phone numbers', () => {
    expect(sanitizePii('call (555) 123-4567 for assistance')).not.toContain('123-4567')
  })

  it('still redacts dash-separated phone numbers', () => {
    expect(sanitizePii('phone: 555-123-4567')).not.toContain('555-123-4567')
  })

  it('still redacts emails', () => {
    expect(sanitizePii('contact jane.doe@example.com now')).not.toContain('jane.doe@example.com')
  })

  it('still redacts patient name labels', () => {
    expect(sanitizePii('Patient: John Smith reported')).not.toContain('John Smith')
  })
})

describe('piiScrubForSource — PII scrub scoped to FDA narratives', () => {
  const text = 'contact jane.doe@example.com about lot 123456789012'

  it('scrubs FDA content', () => {
    expect(piiScrubForSource(text, 'fda')).not.toContain('jane.doe@example.com')
  })

  it('leaves EU regulator content untouched', () => {
    expect(piiScrubForSource(text, 'bfarm')).toBe(text)
    expect(piiScrubForSource(text, 'swissmedic')).toBe(text)
    expect(piiScrubForSource(text, 'mhra')).toBe(text)
  })

  it('leaves unknown-source content untouched (EU default)', () => {
    expect(piiScrubForSource(text, null)).toBe(text)
    expect(piiScrubForSource(text, undefined)).toBe(text)
  })
})
