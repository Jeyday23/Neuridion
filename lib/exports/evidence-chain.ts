import { createHash, createHmac, timingSafeEqual } from 'crypto'
import {
  FILTER_PROMPT_VERSION,
  getProfileFingerprint,
  type ProfileContext,
} from '@/lib/claude/filter-pipeline'
import {
  PMS_CLASSIFICATION_RULESET_VERSION,
  PMS_CLASSIFICATION_SYSTEM_PROMPT,
  PMS_REGULATORY_CITATIONS,
} from '@/lib/regulatory/pms-classification-rules'

export const EVIDENCE_EXPORT_SCHEMA_VERSION = 'neuridion.evidence-chain.v1'
export const EVIDENCE_EXPORT_MEDIA_TYPE = 'application/vnd.neuridion.evidence-chain+json'
export const EVIDENCE_EXPORT_CANONICALIZATION = 'lexicographic-json-nfc-v1'

export type ExportRow = Record<string, unknown>

export interface CapabilityStatus {
  status: 'available' | 'unavailable'
  source_table: string | null
  row_count: number
  reason: 'schema_capability_not_available' | 'historical_data_not_recorded' | null
}

export interface EvidenceChainData {
  run: ExportRow
  profile: ExportRow | null
  profileHistory: ExportRow[]
  results: ExportRow[]
  decisions: ExportRow[]
  canonicalRecords: ExportRow[]
  sourceFetches: ExportRow[]
  evidenceObjects: ExportRow[]
  fetchArtifacts: ExportRow[]
  observations: ExportRow[]
  revisions: ExportRow[]
  governanceEvents: ExportRow[]
  extractionAttempts: ExportRow[]
  extractions: ExportRow[]
  fsnDetails: ExportRow[]
  identityObservations: ExportRow[]
  safetyActions: ExportRow[]
  safetyActionAssertions: ExportRow[]
  supersessions: ExportRow[]
  reviewerAssignments: ExportRow[]
  reviewRequirements: ExportRow[]
  adjudications: ExportRow[]
  samplingRecords: ExportRow[]
  auditEvents: ExportRow[]
  reports: ExportRow[]
  availability: Record<string, CapabilityStatus>
  warnings: string[]
}

export interface EvidenceChainExport {
  manifest: {
    schema_version: typeof EVIDENCE_EXPORT_SCHEMA_VERSION
    media_type: typeof EVIDENCE_EXPORT_MEDIA_TYPE
    generated_at: string
    run_id: string
    generator: {
      name: 'Neuridion'
      export_version: 1
    }
    consistency: {
      model: 'bounded-multi-query-snapshot'
      limitation: string
    }
    integrity: {
      scope: 'payload'
      canonicalization: typeof EVIDENCE_EXPORT_CANONICALIZATION
      digest_algorithm: 'sha-256'
      digest_encoding: 'lowercase-hex'
      payload_sha256: string
      authenticity: {
        method: 'hmac-sha256' | 'none'
        key_id: string | null
        signature: string | null
      }
    }
  }
  payload: Record<string, unknown>
}

function canonicalPrimitive(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers')
    return Object.is(value, -0) ? '0' : JSON.stringify(value)
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}`)
}

/**
 * Deterministic JSON used for integrity verification. Object keys are sorted,
 * strings are NFC-normalized, array order remains significant, and undefined
 * object fields are omitted in the same manner as JSON.stringify.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return canonicalPrimitive(value)
  if (Array.isArray(value)) {
    return `[${value.map((entry) => entry === undefined ? 'null' : canonicalJson(entry)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key.normalize('NFC'))}:${canonicalJson(record[key])}`)
  return `{${entries.join(',')}}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function rowIdentity(row: ExportRow): string {
  const identityKeys = [
    'id', 'fsn_result_id', 'search_run_id', 'run_id', 'authority_record_id',
    'observation_id', 'fetch_id', 'evidence_id', 'extraction_id', 'profile_id',
    'predecessor_id', 'successor_id', 'revision_number', 'artifact_role',
    'created_at', 'decided_at', 'occurred_at', 'selected_at', 'assigned_at',
  ]
  return identityKeys.map((key) => String(row[key] ?? '')).join('\u0000')
}

export function sortExportRows(rows: ExportRow[]): ExportRow[] {
  return [...rows].sort((a, b) => {
    const byIdentity = rowIdentity(a).localeCompare(rowIdentity(b))
    return byIdentity || canonicalJson(a).localeCompare(canonicalJson(b))
  })
}

function stringsFrom(rows: ExportRow[], key: string): string[] {
  return [...new Set(rows
    .map((row) => row[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0))]
    .sort()
}

function objectValue(value: unknown): ExportRow | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ExportRow
    : null
}

function controlledEvidenceMetadata(data: EvidenceChainData): ExportRow[] {
  const snapshot = objectValue(data.run.profile_snapshot)
  const metadata = snapshot?.controlled_evidence
  return Array.isArray(metadata)
    ? sortExportRows(metadata.filter((row): row is ExportRow => Boolean(objectValue(row))))
    : []
}

function profileContextOf(data: EvidenceChainData): ProfileContext | null {
  const snapshot = objectValue(data.run.profile_snapshot)
  const candidate = snapshot ?? data.profile

  if (!candidate) return null
  if (typeof candidate.device_name !== 'string' || typeof candidate.manufacturer !== 'string') {
    return null
  }

  const metadata = controlledEvidenceMetadata(data)
  return {
    device_name: candidate.device_name,
    manufacturer: candidate.manufacturer,
    intended_use: typeof candidate.intended_use === 'string' ? candidate.intended_use : null,
    emdn_code: typeof candidate.emdn_code === 'string' ? candidate.emdn_code : null,
    device_class: typeof candidate.device_class === 'string' ? candidate.device_class : null,
    controlled_evidence_status: candidate.controlled_evidence_status === 'loaded'
      || candidate.controlled_evidence_status === 'unavailable'
      || candidate.controlled_evidence_status === 'not_configured'
      ? candidate.controlled_evidence_status
      : 'not_configured',
    controlled_evidence: metadata.flatMap((document) => {
      if (
        typeof document.kind !== 'string'
        || typeof document.label !== 'string'
        || typeof document.content_sha256 !== 'string'
        || typeof document.extractor_version !== 'string'
      ) return []
      return [{
        kind: document.kind as 'ifu' | 'pms_plan' | 'profile_document',
        label: document.label,
        storage_bucket: 'search-attachments' as const,
        storage_path: '',
        content_sha256: document.content_sha256,
        extractor_version: document.extractor_version,
        text: '',
        original_char_count: typeof document.original_char_count === 'number' ? document.original_char_count : 0,
        included_char_count: typeof document.included_char_count === 'number' ? document.included_char_count : 0,
        truncated: document.truncated === true,
      }]
    }),
  }
}

function documentReferencesFrom(row: ExportRow | null, provenanceSource: string): ExportRow[] {
  if (!row) return []
  const references: ExportRow[] = []
  if (typeof row.ifu_storage_path === 'string' && row.ifu_storage_path.length > 0) {
    references.push({
      document_role: 'ifu',
      storage_bucket: 'ifu-documents',
      storage_path: row.ifu_storage_path,
      provenance_source: provenanceSource,
    })
  }

  const strategy = objectValue(row.search_strategy)
  if (Array.isArray(strategy?.strategy_doc_paths)) {
    for (const path of strategy.strategy_doc_paths) {
      if (typeof path !== 'string' || path.length === 0) continue
      references.push({
        document_role: 'profile_document',
        storage_bucket: 'search-attachments',
        storage_path: path,
        provenance_source: provenanceSource,
      })
    }
  }
  return references
}

function controlledEvidenceReferences(data: EvidenceChainData): ExportRow[] {
  const snapshot = objectValue(data.run.profile_snapshot)
  const frozen = documentReferencesFrom(snapshot, 'search_runs.profile_snapshot')
  if (frozen.length > 0) return sortExportRows(frozen)
  return sortExportRows(documentReferencesFrom(data.profile, 'product_profiles.current_state'))
}

function resultEvidenceIndex(results: ExportRow[]): ExportRow[] {
  return sortExportRows(results.map((row) => ({
    fsn_result_id: row.id ?? null,
    authority_revision_id: row.authority_revision_id ?? null,
    source: row.source_db ?? row.source ?? null,
    source_record_id: row.external_id ?? null,
    source_url: row.source_url ?? null,
    persisted_content_hash: row.content_hash ?? null,
    exported_raw_content_sha256: typeof row.raw_content === 'string'
      ? sha256(row.raw_content)
      : null,
  })))
}

function recordedRulesetVersions(promptVersions: string[]): string[] {
  return [...new Set(promptVersions.flatMap((version) => {
    const separator = version.indexOf(':')
    return separator >= 0 && version.slice(separator + 1).length > 0
      ? [version.slice(separator + 1)]
      : []
  }))].sort()
}

function normalizeGeneratedAt(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString()
  const timestamp = new Date(value)
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError('generatedAt must be a valid timestamp')
  return timestamp.toISOString()
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))
}

export function buildEvidenceChainExport(
  input: EvidenceChainData,
  options: {
    generatedAt?: string
    signingKey?: string | null
    signingKeyId?: string | null
  } = {},
): EvidenceChainExport {
  const runId = typeof input.run.id === 'string' ? input.run.id : ''
  if (!runId) throw new TypeError('Evidence export requires a run ID')
  if (input.run.is_synthetic_canary === true) {
    throw new TypeError('Synthetic canary runs cannot be exported as customer evidence')
  }

  const generatedAt = normalizeGeneratedAt(options.generatedAt)
  const profileContext = profileContextOf(input)
  const recordedPromptVersions = stringsFrom(input.decisions, 'prompt_version')
  const modelsUsed = stringsFrom(input.decisions, 'model_used')
  const rulesetsRecorded = recordedRulesetVersions(recordedPromptVersions)
  const promptVersionsForFingerprint = recordedPromptVersions.length > 0
    ? recordedPromptVersions
    : [FILTER_PROMPT_VERSION]

  const fingerprints = profileContext
    ? promptVersionsForFingerprint.map((promptVersion) => ({
        prompt_version: promptVersion,
        fingerprint: getProfileFingerprint(profileContext, promptVersion),
        derivation: 'Neuridion filter-pipeline profile fingerprint algorithm',
        historical_version_status: recordedPromptVersions.length > 0
          ? 'prompt_version_recorded_on_decision'
          : 'derived_with_current_prompt_version_not_proof_of_historical_use',
      }))
    : []

  const snapshot = objectValue(input.run.profile_snapshot)
  const snapshotControlledEvidence = controlledEvidenceMetadata(input)
  const controlledEvidenceStatus = typeof snapshot?.controlled_evidence_status === 'string'
    ? snapshot.controlled_evidence_status
    : 'historical_data_not_recorded'
  const profileSnapshotHash = input.run.profile_snapshot == null
    ? null
    : sha256(canonicalJson(input.run.profile_snapshot))

  const warnings = [...input.warnings]
  if (recordedPromptVersions.length === 0) {
    warnings.push('No AI decision records contain a prompt version; the current prompt definition is included for reference but is not proof of historical use.')
  }
  if (rulesetsRecorded.length === 0) {
    warnings.push('No standalone or prompt-derived ruleset version was recorded on the AI decisions.')
  }
  if (snapshotControlledEvidence.length === 0 && controlledEvidenceStatus === 'historical_data_not_recorded') {
    warnings.push('This run predates frozen controlled-evidence metadata; current document references are not proof of the evidence used for the decision.')
  }
  if (input.results.length > 0 && input.revisions.length === 0) {
    warnings.push('No immutable authority revision is linked to this run; legacy run-result content is included with an export-time SHA-256 digest.')
  }

  const payload: Record<string, unknown> = {
    run: input.run,
    device_context: {
      profile_snapshot: input.run.profile_snapshot ?? null,
      profile_snapshot_sha256: profileSnapshotHash,
      current_profile_informational_only: input.profile,
      profile_edit_history: sortExportRows(input.profileHistory),
      controlled_evidence: {
        run_snapshot_status: controlledEvidenceStatus,
        frozen_metadata: snapshotControlledEvidence,
        storage_references: controlledEvidenceReferences(input),
        limitation: 'The JSON continuity export contains hashes, bounded-extract metadata, and private storage references; referenced document bytes require a separately controlled archive.',
      },
    },
    classifier_context: {
      historical_use_evidence: {
        models_recorded: modelsUsed,
        prompt_versions_recorded: recordedPromptVersions,
        ruleset_versions_derived_from_recorded_prompts: rulesetsRecorded,
        ai_decisions: sortExportRows(input.decisions),
      },
      current_generator_definition_not_proof_of_historical_use: {
        prompt_version: FILTER_PROMPT_VERSION,
        ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
        system_prompt: PMS_CLASSIFICATION_SYSTEM_PROMPT,
        system_prompt_sha256: sha256(PMS_CLASSIFICATION_SYSTEM_PROMPT),
        regulatory_citations: PMS_REGULATORY_CITATIONS,
      },
      profile_fingerprints: fingerprints,
    },
    human_oversight: {
      regulatory_disposition_policy: 'The final post-reveal disposition is the regulatory disposition; blind provisional dispositions remain validation evidence. A post-reveal downgrade to excluded requires recorded rationale and may require independent second review under the frozen policy.',
      reviewer_assignments: sortExportRows(input.reviewerAssignments),
      review_requirements: sortExportRows(input.reviewRequirements),
      adjudication_events: sortExportRows(input.adjudications),
      exclusion_sampling_records: sortExportRows(input.samplingRecords),
      run_approval: {
        review_status: input.run.review_status ?? null,
        reviewed_by: input.run.reviewed_by ?? null,
        reviewed_at: input.run.reviewed_at ?? null,
      },
      audit_events: sortExportRows(input.auditEvents),
    },
    regulatory_evidence: {
      run_result_hash_index: resultEvidenceIndex(input.results),
      run_results: sortExportRows(input.results),
      canonical_records: sortExportRows(input.canonicalRecords),
      observations: sortExportRows(input.observations),
      authority_record_revisions: sortExportRows(input.revisions),
      source_fetches: sortExportRows(input.sourceFetches),
      fetch_artifacts: sortExportRows(input.fetchArtifacts),
      evidence_objects: sortExportRows(input.evidenceObjects),
      evidence_governance_events: sortExportRows(input.governanceEvents),
      document_extraction_attempts: sortExportRows(input.extractionAttempts),
      document_extractions: sortExportRows(input.extractions),
      extracted_fsn_details: sortExportRows(input.fsnDetails),
      identity_observations: sortExportRows(input.identityObservations),
      safety_actions: sortExportRows(input.safetyActions),
      safety_action_match_assertions: sortExportRows(input.safetyActionAssertions),
      authority_record_supersessions: sortExportRows(input.supersessions),
    },
    reports: sortExportRows(input.reports),
    capability_availability: sortedRecord(input.availability),
    warnings: [...new Set(warnings)].sort(),
  }

  const canonicalPayload = canonicalJson(payload)
  const payloadSha256 = sha256(canonicalPayload)
  const signingKey = options.signingKey || null
  const signature = signingKey
    ? createHmac('sha256', signingKey).update(canonicalPayload).digest('hex')
    : null

  return {
    manifest: {
      schema_version: EVIDENCE_EXPORT_SCHEMA_VERSION,
      media_type: EVIDENCE_EXPORT_MEDIA_TYPE,
      generated_at: generatedAt,
      run_id: runId,
      generator: {
        name: 'Neuridion',
        export_version: 1,
      },
      consistency: {
        model: 'bounded-multi-query-snapshot',
        limitation: 'Rows are read through bounded, independently paginated queries rather than one database transaction; append-only events created during generation may appear only in a later export.',
      },
      integrity: {
        scope: 'payload',
        canonicalization: EVIDENCE_EXPORT_CANONICALIZATION,
        digest_algorithm: 'sha-256',
        digest_encoding: 'lowercase-hex',
        payload_sha256: payloadSha256,
        authenticity: {
          method: signature ? 'hmac-sha256' : 'none',
          key_id: signature ? (options.signingKeyId ?? null) : null,
          signature,
        },
      },
    },
    payload,
  }
}

export function verifyEvidenceChainDigest(exported: EvidenceChainExport): boolean {
  const actual = Buffer.from(sha256(canonicalJson(exported.payload)), 'hex')
  const expectedHex = exported.manifest.integrity.payload_sha256
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function verifyEvidenceChainAuthenticity(
  exported: EvidenceChainExport,
  signingKey: string,
): boolean {
  const authenticity = exported.manifest.integrity.authenticity
  if (authenticity.method !== 'hmac-sha256' || !authenticity.signature) return false
  if (!/^[0-9a-f]{64}$/.test(authenticity.signature)) return false
  const actual = Buffer.from(
    createHmac('sha256', signingKey).update(canonicalJson(exported.payload)).digest('hex'),
    'hex',
  )
  const expected = Buffer.from(authenticity.signature, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
