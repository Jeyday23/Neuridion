import { describe, expect, it } from 'vitest'
import { EVIDENCE_ADAPTER_VERSIONS, PERSONAL_DATA_SOURCES } from '@/lib/evidence/constants'
import {
  SOURCE_AUTHORITY,
  identityMethodForSourceRecord,
  sourceCaptureAllowed,
} from '@/lib/evidence/source-authority'

describe('source authority contract', () => {
  it('is the single source of parser-version truth', () => {
    for (const [source, contract] of Object.entries(SOURCE_AUTHORITY)) {
      expect(EVIDENCE_ADAPTER_VERSIONS[source as keyof typeof EVIDENCE_ADAPTER_VERSIONS])
        .toBe(contract.parserVersion)
    }
  })

  it('does not represent FDA adverse events as FSNs or coverage', () => {
    expect(SOURCE_AUTHORITY.fda.evidenceClass).toBe('adverse_event_signal')
    expect(SOURCE_AUTHORITY.fda.completeness).toBe('interactive_signal_query_not_coverage')
    expect(SOURCE_AUTHORITY.fda.crossSourceActionKey).toBe('none')
  })

  it('never makes Basic UDI-DI a corrective-action master key', () => {
    expect(SOURCE_AUTHORITY.eudamed.basicUdiRole).toBe('supporting_device_key')
    expect(SOURCE_AUTHORITY.eudamed.crossSourceActionKey).toBe('issuer_reference_composite')
  })

  it('claims raw-response retention only for the implemented BfArM path', () => {
    expect(SOURCE_AUTHORITY.bfarm.rawResponseRetentionImplemented).toBe(true)
    expect(SOURCE_AUTHORITY.mhra.rawResponseRetentionImplemented).toBe(false)
    expect(SOURCE_AUTHORITY.swissmedic.rawResponseRetentionImplemented).toBe(false)
    expect(SOURCE_AUTHORITY.fda.rawResponseRetentionImplemented).toBe(false)
    expect(SOURCE_AUTHORITY.eudamed.rawResponseRetentionImplemented).toBe(false)
  })

  it('requires a second explicit approval before capturing FDA adapter output', () => {
    expect(PERSONAL_DATA_SOURCES.has('fda')).toBe(true)
    expect(sourceCaptureAllowed('fda', false)).toBe(false)
    expect(sourceCaptureAllowed('fda', true)).toBe(true)
    expect(sourceCaptureAllowed('bfarm', false)).toBe(true)
  })

  it('derives source identity according to adapter behavior', () => {
    expect(identityMethodForSourceRecord('mhra', 'mhra-ref-2026-001')).toBe('authority_reference')
    expect(identityMethodForSourceRecord('mhra', 'roundup#fallback')).toBe('national_reference')
    expect(identityMethodForSourceRecord('eudamed', 'future')).toBe('udi_device_key')
  })

  it('leaves unsupported quality thresholds unset rather than inventing evidence', () => {
    expect(SOURCE_AUTHORITY.mhra.parityWarningThreshold).toBeNull()
    for (const contract of Object.values(SOURCE_AUTHORITY)) {
      expect(contract.authoritativeMatchTarget).toBeNull()
    }
  })
})
