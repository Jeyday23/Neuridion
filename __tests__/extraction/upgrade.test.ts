import { describe, expect, it, vi } from 'vitest'
import { appendIdentityObservation, normalizeExtractedIdentity } from '@/lib/extraction/upgrade'

describe('appendIdentityObservation', () => {
  it('normalizes extracted identity values', () => {
    expect(normalizeExtractedIdentity(' fsca 2026 / 0142 ')).toBe('FSCA 2026 / 0142')
  })

  it('does nothing without canonical authority id or reference', async () => {
    await expect(appendIdentityObservation({
      authorityRecordId: null,
      extractionId: 'extract-1',
      fscaReference: 'FSCA-2026-0142',
      db: {} as never,
    })).resolves.toEqual({ action: 'none' })
  })

  it('appends identity observation instead of mutating fsn_canonical', async () => {
    const insert = vi.fn(() => ({ error: null }))
    const db = { from: vi.fn(() => ({ insert })) }

    const result = await appendIdentityObservation({
      authorityRecordId: 'authority-1',
      extractionId: 'extract-1',
      fscaReference: 'FSCA-2026-0142',
      db: db as never,
    })

    expect(result).toEqual({ action: 'observed', value: 'FSCA-2026-0142' })
    expect(db.from).toHaveBeenCalledWith('fsn_identity_observations')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      authority_record_id: 'authority-1',
      extraction_id: 'extract-1',
      observation_type: 'fsca_reference',
      observed_value: 'FSCA-2026-0142',
      normalized_value: 'FSCA-2026-0142',
    }))
  })
})
