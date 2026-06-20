import type { IdentityMethod } from './types'

const CONFIDENCE: Record<IdentityMethod, number> = {
  authority_reference: 1,
  national_reference: 0.9,
  udi_device_key: 0.6,
  url_hash_low_stability: 0.25,
  generated_low_stability: 0.2,
}

export function identityConfidence(method: IdentityMethod): number {
  return CONFIDENCE[method]
}

export function normalizeReference(reference: string): string {
  return reference
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[\/_]+/g, '-')
    .toUpperCase()
}

export function normalizeManufacturerKey(manufacturer: string | null): string | null {
  if (!manufacturer) return null
  const normalized = manufacturer
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/\b(gmbh|ag|ltd|limited|inc|incorporated|corp|corporation|llc|bv|sarl|sa)\b\.?/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
  return normalized || null
}

export function issuerReferenceKey(
  manufacturer: string | null,
  reference: string | null,
): string | null {
  const manufacturerKey = normalizeManufacturerKey(manufacturer)
  if (!manufacturerKey || !reference) return null
  return `${manufacturerKey}:${normalizeReference(reference)}`
}
