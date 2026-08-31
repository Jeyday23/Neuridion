import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  buildEvidenceChainExport,
  canonicalJson,
  type EvidenceChainData,
  verifyEvidenceChainAuthenticity,
  verifyEvidenceChainDigest,
} from '@/lib/exports/evidence-chain'

const RUN_ID = '11111111-2222-4333-8444-555555555555'
const PROFILE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const GENERATED_AT = '2026-08-31T10:15:30.000Z'

function evidenceData(): EvidenceChainData {
  return {
    run: {
      id: RUN_ID,
      user_id: 'user-1',
      profile_id: PROFILE_ID,
      is_synthetic_canary: false,
      review_status: 'approved',
      reviewed_by: 'reviewer-1',
      reviewed_at: '2026-08-30T12:00:00.000Z',
      profile_snapshot: {
        device_name: 'Infusion Controller',
        manufacturer: 'Acme Medical GmbH',
        intended_use: 'Controlled infusion',
        emdn_code: 'Z120301',
        device_class: 'IIb',
        ifu_storage_path: `${PROFILE_ID}/ifu-v7.pdf`,
        search_strategy: { strategy_doc_paths: [`${PROFILE_ID}/pms-plan-v3.docx`] },
        controlled_evidence_status: 'loaded',
        controlled_evidence: [{
          kind: 'ifu',
          label: 'ifu-v7.pdf',
          content_sha256: 'a'.repeat(64),
          extractor_version: 'profile-evidence@1',
          original_char_count: 8_000,
          included_char_count: 6_000,
          truncated: true,
        }],
      },
    },
    profile: { id: PROFILE_ID, device_name: 'Current changed name', manufacturer: 'Acme' },
    profileHistory: [{ id: 'history-b' }, { id: 'history-a' }],
    results: [{
      id: 'result-b',
      source_db: 'bfarm',
      external_id: 'B-200',
      source_url: 'https://authority.example/B-200',
      raw_content: 'raw regulatory record',
      content_hash: 'legacy-content-hash',
      authority_revision_id: 'revision-1',
    }],
    decisions: [{
      id: 'decision-1',
      fsn_result_id: 'result-b',
      model_used: 'claude-sonnet-4-6',
      prompt_version: 'fp-v3:eu-pms-relevance@2026-08-30',
      decision: 'relevant',
    }],
    canonicalRecords: [{ id: 'canonical-1' }],
    sourceFetches: [{ id: 'fetch-1', adapter_version: 'bfarm@2' }],
    evidenceObjects: [{ id: 'evidence-1', content_hash: 'b'.repeat(64), storage_path: 'private/object' }],
    fetchArtifacts: [{ fetch_id: 'fetch-1', evidence_id: 'evidence-1', artifact_role: 'response' }],
    observations: [{ id: 'observation-1', source_payload_hash: 'c'.repeat(64) }],
    revisions: [{ id: 'revision-1', revision_hash: 'd'.repeat(64) }],
    governanceEvents: [],
    extractionAttempts: [],
    extractions: [],
    fsnDetails: [],
    identityObservations: [],
    safetyActions: [],
    safetyActionAssertions: [],
    supersessions: [],
    reviewerAssignments: [{ id: 'assignment-1', reviewer_id: 'reviewer-1' }],
    reviewRequirements: [{ id: 'requirement-1', fsn_result_id: 'result-b' }],
    adjudications: [{ id: 'adjudication-1', phase: 'final', disposition: 'relevant' }],
    samplingRecords: [{
      id: 'sample-1',
      inclusion_probability: 0.15,
      policy_version: 'exclusion-review-v1',
    }],
    auditEvents: [{ id: 'audit-1', event_type: 'prrc_review_completed' }],
    reports: [{ id: 'report-1', run_id: RUN_ID }],
    availability: {
      sampling_metadata: { status: 'available', source_table: 'exclusion_review_samples', row_count: 1, reason: null },
      human_adjudications: { status: 'available', source_table: 'human_adjudication_events', row_count: 1, reason: null },
    },
    warnings: [],
  }
}

describe('evidence-chain continuity format', () => {
  it('builds a deterministic, versioned payload with the complete decision context', () => {
    const data = evidenceData()
    const first = buildEvidenceChainExport(data, { generatedAt: GENERATED_AT })
    const reordered = evidenceData()
    reordered.profileHistory.reverse()
    const second = buildEvidenceChainExport(reordered, { generatedAt: GENERATED_AT })

    expect(first).toEqual(second)
    expect(first.manifest.generated_at).toBe(GENERATED_AT)
    expect(first.manifest.schema_version).toBe('neuridion.evidence-chain.v1')
    expect(first.manifest.consistency.model).toBe('bounded-multi-query-snapshot')
    expect(verifyEvidenceChainDigest(first)).toBe(true)

    const deviceContext = first.payload.device_context as Record<string, unknown>
    const controlled = deviceContext.controlled_evidence as Record<string, unknown>
    expect(controlled.frozen_metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ content_sha256: 'a'.repeat(64) }),
    ]))
    expect(controlled.storage_references).toEqual(expect.arrayContaining([
      expect.objectContaining({ storage_bucket: 'ifu-documents', storage_path: `${PROFILE_ID}/ifu-v7.pdf` }),
      expect.objectContaining({ storage_bucket: 'search-attachments', storage_path: `${PROFILE_ID}/pms-plan-v3.docx` }),
    ]))

    const classifier = first.payload.classifier_context as Record<string, Record<string, unknown>>
    expect(classifier.historical_use_evidence.models_recorded).toEqual(['claude-sonnet-4-6'])
    expect(classifier.current_generator_definition_not_proof_of_historical_use).toEqual(expect.objectContaining({
      ruleset_version: 'eu-pms-relevance@2026-08-30',
      prompt_version: 'fp-v3:eu-pms-relevance@2026-08-30',
      system_prompt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }))

    const regulatory = first.payload.regulatory_evidence as Record<string, unknown>
    expect(regulatory.run_result_hash_index).toEqual([
      expect.objectContaining({
        fsn_result_id: 'result-b',
        authority_revision_id: 'revision-1',
        exported_raw_content_sha256: createHash('sha256').update('raw regulatory record').digest('hex'),
      }),
    ])
    const oversight = first.payload.human_oversight as Record<string, unknown>
    expect(oversight.reviewer_assignments).toHaveLength(1)
    expect(oversight.review_requirements).toHaveLength(1)
    expect(oversight.adjudication_events).toHaveLength(1)
    expect(oversight.exclusion_sampling_records).toHaveLength(1)
  })

  it('signs the canonical payload and detects digest or signature tampering', () => {
    const exported = buildEvidenceChainExport(evidenceData(), {
      generatedAt: GENERATED_AT,
      signingKey: 'test-signing-key-with-adequate-length',
      signingKeyId: 'test-key-1',
    })

    expect(verifyEvidenceChainDigest(exported)).toBe(true)
    expect(verifyEvidenceChainAuthenticity(exported, 'test-signing-key-with-adequate-length')).toBe(true)
    expect(verifyEvidenceChainAuthenticity(exported, 'wrong-key')).toBe(false)

    ;(exported.payload.run as Record<string, unknown>).review_status = 'draft'
    expect(verifyEvidenceChainDigest(exported)).toBe(false)
    expect(verifyEvidenceChainAuthenticity(exported, 'test-signing-key-with-adequate-length')).toBe(false)
  })

  it('canonicalizes Unicode and object keys and rejects invalid scalar values', () => {
    expect(canonicalJson({ z: 'e\u0301', a: -0 })).toBe('{"a":0,"z":"é"}')
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow(/non-finite/)
  })

  it('rejects synthetic canaries and invalid generation timestamps', () => {
    const canary = evidenceData()
    canary.run.is_synthetic_canary = true
    expect(() => buildEvidenceChainExport(canary)).toThrow(/canary/)
    expect(() => buildEvidenceChainExport(evidenceData(), { generatedAt: 'not-a-date' })).toThrow(/timestamp/)
  })
})
