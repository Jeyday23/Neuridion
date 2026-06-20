import { issuerReferenceKey } from './identity'
import type { NormalizedObservation, ReconciliationCandidate } from './types'

export interface ReconciliationLookup {
  byAuthorityRecord(authorityRecordId: string): Promise<{ id: string } | null>
  byIssuerReference(key: string): Promise<{ id: string } | null>
  fuzzyCandidates(input: {
    manufacturer: string
    productName: string
    fsnDate: string
  }): Promise<Array<{ id: string; score: number }>>
}

export async function findReconciliationCandidates(
  observation: NormalizedObservation,
  lookup: ReconciliationLookup,
): Promise<ReconciliationCandidate[]> {
  const existing = await lookup.byAuthorityRecord(observation.authorityRecordId)
  if (existing) {
    return [{
      safetyActionId: existing.id,
      method: 'authority_record',
      matchedOn: observation.authorityRecordId,
      confidence: 1,
      autoConfirm: true,
    }]
  }

  const issuerKey = issuerReferenceKey(observation.manufacturer, observation.fscaReference)
  if (issuerKey) {
    const referenceMatch = await lookup.byIssuerReference(issuerKey)
    if (referenceMatch) {
      return [{
        safetyActionId: referenceMatch.id,
        method: 'issuer_reference',
        matchedOn: issuerKey,
        confidence: 0.98,
        autoConfirm: true,
      }]
    }
  }

  if (!observation.manufacturer || !observation.productName || !observation.fsnDate) return []
  const fuzzy = await lookup.fuzzyCandidates({
    manufacturer: observation.manufacturer,
    productName: observation.productName,
    fsnDate: observation.fsnDate,
  })
  return fuzzy.map((candidate) => ({
    safetyActionId: candidate.id,
    method: 'fuzzy_candidate',
    matchedOn: [observation.manufacturer, observation.productName, observation.fsnDate].join('|'),
    confidence: Math.min(0.79, Math.max(0, candidate.score)),
    autoConfirm: false,
  }))
}

