import { canonicalJson, sha256Hex } from './hash'

export function shouldCreateAuthorityRevision(
  currentSourcePayloadHash: string | null,
  incomingSourcePayloadHash: string,
): boolean {
  return currentSourcePayloadHash === null || currentSourcePayloadHash !== incomingSourcePayloadHash
}

export function revisionHash(input: {
  previousRevisionHash: string | null
  authorityRecordId: string
  revisionNumber: number
  sourcePayloadHash: string
  observationId: string
}): string {
  return sha256Hex(canonicalJson(input))
}

export function diffFields(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(next)])
  for (const key of keys) {
    const from = previous?.[key] ?? null
    const to = next[key] ?? null
    if (canonicalJson(from) !== canonicalJson(to)) diff[key] = { from, to }
  }
  return diff
}

