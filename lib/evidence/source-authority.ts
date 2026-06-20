import type { IdentityMethod, SourceName } from './types'

export type EvidenceClass =
  | 'field_safety_notice'
  | 'field_safety_corrective_action'
  | 'adverse_event_signal'
  | 'reserved_vigilance_source'

export type CompletenessSemantics =
  | 'complete_or_empty_for_requested_range'
  | 'official_channel_union_with_parity_diagnostic'
  | 'interactive_signal_query_not_coverage'
  | 'not_operational'

export interface SourceAuthorityContract {
  operational: boolean
  evidenceClass: EvidenceClass
  adapters: ReadonlyArray<{
    name: string
    role: 'primary' | 'supplement' | 'cross_check' | 'fallback'
  }>
  parserVersion: string
  typicalIdentityMethods: readonly IdentityMethod[]
  crossSourceActionKey: 'issuer_reference_composite' | 'none'
  basicUdiRole: 'supporting_device_key' | 'unavailable'
  currentCaptureKind: 'adapter_output' | 'none'
  rawResponseRetentionImplemented: boolean
  containsPersonalData: 'unlikely_public_record' | 'potential_third_party_data'
  requiresSensitiveDataApproval: boolean
  pollCadenceHours: number | null
  freshnessSloHours: number | null
  completeness: CompletenessSemantics
  authoritativeMatchTarget: number | null
  parityWarningThreshold: number | null
}

export const SOURCE_AUTHORITY = {
  bfarm: {
    operational: true,
    evidenceClass: 'field_safety_notice',
    adapters: [
      { name: 'html_portal', role: 'primary' },
      { name: 'rss_feed', role: 'supplement' },
      { name: 'firecrawl', role: 'fallback' },
    ],
    parserVersion: 'bfarm@1',
    typicalIdentityMethods: ['national_reference', 'url_hash_low_stability'],
    crossSourceActionKey: 'issuer_reference_composite',
    basicUdiRole: 'unavailable',
    currentCaptureKind: 'adapter_output',
    rawResponseRetentionImplemented: false,
    containsPersonalData: 'unlikely_public_record',
    requiresSensitiveDataApproval: false,
    pollCadenceHours: 24,
    freshnessSloHours: 48,
    completeness: 'complete_or_empty_for_requested_range',
    authoritativeMatchTarget: null,
    parityWarningThreshold: null,
  },
  mhra: {
    operational: true,
    evidenceClass: 'field_safety_notice',
    adapters: [
      { name: 'govuk_search_content_api', role: 'primary' },
      { name: 'official_excel', role: 'cross_check' },
    ],
    parserVersion: 'mhra@1',
    typicalIdentityMethods: ['authority_reference', 'national_reference'],
    crossSourceActionKey: 'issuer_reference_composite',
    basicUdiRole: 'unavailable',
    currentCaptureKind: 'adapter_output',
    rawResponseRetentionImplemented: false,
    containsPersonalData: 'unlikely_public_record',
    requiresSensitiveDataApproval: false,
    pollCadenceHours: 24,
    freshnessSloHours: 48,
    completeness: 'official_channel_union_with_parity_diagnostic',
    authoritativeMatchTarget: null,
    // Must be established from a representative back-to-back baseline.
    parityWarningThreshold: null,
  },
  swissmedic: {
    operational: true,
    evidenceClass: 'field_safety_corrective_action',
    adapters: [{ name: 'structured_rest_api', role: 'primary' }],
    parserVersion: 'swissmedic@1',
    typicalIdentityMethods: ['authority_reference'],
    crossSourceActionKey: 'issuer_reference_composite',
    basicUdiRole: 'unavailable',
    currentCaptureKind: 'adapter_output',
    rawResponseRetentionImplemented: false,
    containsPersonalData: 'unlikely_public_record',
    requiresSensitiveDataApproval: false,
    pollCadenceHours: 24,
    freshnessSloHours: 48,
    completeness: 'complete_or_empty_for_requested_range',
    authoritativeMatchTarget: null,
    parityWarningThreshold: null,
  },
  fda: {
    operational: true,
    evidenceClass: 'adverse_event_signal',
    adapters: [{ name: 'openfda_device_event_api', role: 'primary' }],
    parserVersion: 'fda@1',
    typicalIdentityMethods: ['authority_reference', 'generated_low_stability'],
    crossSourceActionKey: 'none',
    basicUdiRole: 'unavailable',
    currentCaptureKind: 'adapter_output',
    rawResponseRetentionImplemented: false,
    containsPersonalData: 'potential_third_party_data',
    requiresSensitiveDataApproval: true,
    pollCadenceHours: null,
    // FDA is queried live and is not an ingestion-freshness source.
    freshnessSloHours: null,
    completeness: 'interactive_signal_query_not_coverage',
    authoritativeMatchTarget: null,
    parityWarningThreshold: null,
  },
  eudamed: {
    operational: false,
    evidenceClass: 'reserved_vigilance_source',
    adapters: [],
    parserVersion: 'eudamed@0',
    typicalIdentityMethods: [],
    crossSourceActionKey: 'issuer_reference_composite',
    basicUdiRole: 'supporting_device_key',
    currentCaptureKind: 'none',
    rawResponseRetentionImplemented: false,
    containsPersonalData: 'unlikely_public_record',
    requiresSensitiveDataApproval: false,
    pollCadenceHours: null,
    freshnessSloHours: null,
    completeness: 'not_operational',
    authoritativeMatchTarget: null,
    parityWarningThreshold: null,
  },
} as const satisfies Record<SourceName, SourceAuthorityContract>

export function identityMethodForSourceRecord(
  source: SourceName,
  sourceRecordId: string,
): IdentityMethod {
  if (source === 'bfarm' && /^[0-9a-f]{16}$/.test(sourceRecordId)) return 'url_hash_low_stability'
  if (source === 'mhra' && sourceRecordId.startsWith('mhra-ref-')) return 'authority_reference'
  if (source === 'swissmedic') return 'authority_reference'
  if (source === 'fda' && sourceRecordId.startsWith('maude-')) return 'generated_low_stability'
  if (source === 'fda') return 'authority_reference'
  if (source === 'eudamed') return 'udi_device_key'
  return 'national_reference'
}

export function sourceCaptureAllowed(source: SourceName, sensitiveDataApproved: boolean): boolean {
  const contract = SOURCE_AUTHORITY[source]
  if (!contract.operational) return false
  return !contract.requiresSensitiveDataApproval || sensitiveDataApproved
}
