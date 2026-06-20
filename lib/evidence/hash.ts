import { createHash } from 'crypto'
import type { NormalizedObservation } from './types'

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.normalize('NFC')
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers')
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    )
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}`)
}

export function normalizedObservationHash(observation: NormalizedObservation): string {
  return sha256Hex(canonicalJson({
    source: observation.source,
    sourceRecordId: observation.sourceRecordId,
    identityMethod: observation.identityMethod,
    fscaReference: observation.fscaReference,
    basicUdiDi: observation.basicUdiDi,
    title: observation.title,
    manufacturer: observation.manufacturer,
    productName: observation.productName,
    fsnDate: observation.fsnDate,
    sourceUrl: observation.sourceUrl,
  }))
}

