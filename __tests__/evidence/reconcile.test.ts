import { describe, expect, it, vi } from 'vitest'
import { findReconciliationCandidates, type ReconciliationLookup } from '@/lib/evidence/reconcile'
import type { NormalizedObservation } from '@/lib/evidence/types'

const base: NormalizedObservation = {
  source: 'mhra',
  sourceRecordId: 'MHRA-1',
  authorityRecordId: '00000000-0000-4000-8000-000000000001',
  identityMethod: 'national_reference',
  fscaReference: 'FSCA-2026-1',
  basicUdiDi: 'BASIC-UDI-DEVICE-FAMILY',
  title: 'Field safety notice',
  manufacturer: 'B. Braun GmbH',
  productName: 'Infusomat',
  fsnDate: '2026-03-01',
  sourceUrl: 'https://www.gov.uk/example',
  sourcePayloadHash: 'a'.repeat(64),
  parserVersion: 'mhra@1',
}

function lookup(overrides: Partial<ReconciliationLookup> = {}): ReconciliationLookup {
  return {
    byAuthorityRecord: vi.fn().mockResolvedValue(null),
    byIssuerReference: vi.fn().mockResolvedValue(null),
    fuzzyCandidates: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('reconciliation safety', () => {
  it('reuses an already confirmed authority-record relationship first', async () => {
    const candidates = await findReconciliationCandidates(base, lookup({
      byAuthorityRecord: vi.fn().mockResolvedValue({ id: 'action-1' }),
    }))
    expect(candidates[0]).toMatchObject({ method: 'authority_record', autoConfirm: true })
  })

  it('can confirm the composite issuer/reference key', async () => {
    const candidates = await findReconciliationCandidates(base, lookup({
      byIssuerReference: vi.fn().mockResolvedValue({ id: 'action-2' }),
    }))
    expect(candidates[0]).toMatchObject({ method: 'issuer_reference', autoConfirm: true })
  })

  it('never treats Basic UDI-DI alone as a corrective-action identity', async () => {
    const candidates = await findReconciliationCandidates(
      { ...base, manufacturer: null, fscaReference: null, productName: null, fsnDate: null },
      lookup(),
    )
    expect(candidates).toEqual([])
  })

  it('caps fuzzy matches below auto-confirmation and marks them as proposals', async () => {
    const candidates = await findReconciliationCandidates(base, lookup({
      fuzzyCandidates: vi.fn().mockResolvedValue([{ id: 'action-3', score: 0.99 }]),
    }))
    expect(candidates[0]).toMatchObject({
      method: 'fuzzy_candidate',
      confidence: 0.79,
      autoConfirm: false,
    })
  })
})

