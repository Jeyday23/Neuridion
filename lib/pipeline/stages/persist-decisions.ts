import { randomUUID } from 'crypto'
import type { PipelineContext, DecisionRow, InsertedFsnRow } from '../types'
import { EVIDENCE_ADAPTER_VERSIONS } from '@/lib/evidence/constants'
import { canonicalJson, sha256Hex } from '@/lib/evidence/hash'
import type { Json } from '@/types/supabase'
import { addEvidenceSchemaWarning, isMissingEvidenceLinkColumn } from '../schema-compat'
import {
  DEFAULT_EXCLUSION_SAMPLING_POLICY,
  hasSeriousEventLanguage,
  inferValidationLanguage,
  runDeterministicExclusionChallenger,
  selectExclusionForReview,
} from '@/lib/validation/exclusion-sampling'

export const ACCURACY_PROVENANCE_SCHEMA_WARNING =
  'Accuracy provenance migration 073 is not applied; exclusions were converted to manual review and sampling was paused.'

const ACCURACY_PROVENANCE_COLUMNS =
  /provider|model_id|ruleset_version|input_sha256|output_sha256|original_decision_at|presentation_rank|cache_hit|decision_method|deterministic_reason_codes|deterministic_evidence|sample_source/i

type DbDecisionMethod = 'ai_ranking' | 'deterministic_scope' | 'vigilance_bypass' | 'manual_review_required' | 'ai_unavailable'
type SampleSource = 'model_presentation' | 'deterministic'

function isMissingAccuracyProvenance(error: { code?: string | null; message?: string | null } | null): boolean {
  return error?.code === 'PGRST204' && ACCURACY_PROVENANCE_COLUMNS.test(error.message ?? '')
}

function addAccuracySchemaWarning(warnings: string[]): void {
  if (!warnings.includes(ACCURACY_PROVENANCE_SCHEMA_WARNING)) warnings.push(ACCURACY_PROVENANCE_SCHEMA_WARNING)
}

function normalizeDecisionMethod(decision: DecisionRow): DbDecisionMethod {
  switch (decision.decision_method) {
    case 'deterministic_scope': return 'deterministic_scope'
    case 'vigilance_bypass': return 'vigilance_bypass'
    case 'ai_ranking': return 'ai_ranking'
    case 'ai_unavailable': return 'ai_unavailable'
    case 'manual_review_required': return 'manual_review_required'
    default:
      if (decision.decision === 'excluded') return 'deterministic_scope'
      if (decision.decision === 'filter_failed') return 'manual_review_required'
      return 'ai_ranking'
  }
}

function normalizeDeterministicEvidence(value: Record<string, unknown> | unknown[] | null | undefined): Json | null {
  if (value == null) return null
  return JSON.parse(JSON.stringify(Array.isArray(value) ? { matches: value } : value)) as Json
}

function fullDecisionInputHash(ctx: PipelineContext, result: InsertedFsnRow | undefined): string {
  return sha256Hex(canonicalJson({
    profile: {
      device_name: ctx.profile.device_name,
      manufacturer: ctx.profile.manufacturer,
      intended_use: ctx.profile.intended_use,
      emdn_code: ctx.profile.emdn_code,
      device_class: ctx.profile.device_class,
      controlled_evidence: (ctx.profile.controlled_evidence ?? []).map((document) => ({
        kind: document.kind,
        label: document.label,
        content_sha256: document.content_sha256,
        extractor_version: document.extractor_version,
        included_char_count: document.included_char_count,
        text: document.text,
      })),
    },
    record: result ? {
      external_id: result.external_id,
      title: result.title,
      manufacturer: result.manufacturer,
      raw_content: result.raw_content,
      fsn_date: result.fsn_date,
      source_db: result.source_db,
      source_url: result.source_url,
    } : null,
  }))
}

function normalizedOutputHash(decision: DecisionRow): string {
  return sha256Hex(canonicalJson({
    decision: decision.decision,
    rationale: decision.rationale,
    confidence: decision.confidence,
    presentation_rank: decision.presentation_rank ?? null,
    deterministic_reason_codes: decision.deterministic_reason_codes ?? [],
    deterministic_evidence: decision.deterministic_evidence ?? [],
  }))
}

function legacyRow(decision: DecisionRow, runId: string, forceManualReview = false) {
  const blockedExclusion = forceManualReview && decision.decision === 'excluded'
  return {
    id: randomUUID(),
    fsn_result_id: decision.fsn_result_id,
    search_run_id: runId,
    decision: blockedExclusion ? 'filter_failed' : decision.decision,
    rationale: blockedExclusion
      ? `${decision.rationale} [Migration 073 unavailable: automated exclusion blocked; manual PRRC review required.]`
      : decision.rationale,
    confidence: blockedExclusion ? 0 : (decision.confidence ?? 0),
    model_used: decision.model,
    stage: 'stage1',
  }
}

export async function persistDecisionsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.decisions.length === 0) return
  const resultById = new Map(ctx.insertedRows.map((row) => [row.id, row]))
  const persistedAt = new Date().toISOString()
  const legacyRows = ctx.decisions.map((decision) => legacyRow(decision, ctx.runId))
  const rows = ctx.decisions.map((decision, index) => {
    const result = resultById.get(decision.fsn_result_id)
    const source = result?.source_db
    const parserVersion = source && source in EVIDENCE_ADAPTER_VERSIONS
      ? EVIDENCE_ADAPTER_VERSIONS[source as keyof typeof EVIDENCE_ADAPTER_VERSIONS]
      : null
    const method = normalizeDecisionMethod(decision)
    return {
      ...legacyRows[index],
      authority_revision_id: result?.authority_revision_id ?? null,
      evidence_parser_version: result?.authority_revision_id ? parserVersion : null,
      provider: decision.provider ?? (method === 'ai_ranking' ? 'anthropic' : 'neuridion'),
      model_id: decision.model_id ?? decision.model ?? (method === 'ai_ranking' ? 'unknown-ai-model' : 'deterministic-rules'),
      prompt_version: decision.prompt_version ?? 'not-applicable',
      ruleset_version: decision.ruleset_version ?? 'accuracy-safety-v1',
      input_sha256: decision.input_sha256 ?? fullDecisionInputHash(ctx, result),
      output_sha256: decision.output_sha256 ?? normalizedOutputHash(decision),
      original_decision_at: decision.original_decision_at ?? persistedAt,
      presentation_rank: decision.presentation_rank ?? null,
      cache_hit: decision.cache_hit ?? false,
      decision_method: method,
      deterministic_reason_codes: decision.deterministic_reason_codes ?? [],
      deterministic_evidence: normalizeDeterministicEvidence(decision.deterministic_evidence),
    }
  })

  let { error: decisionsError } = await ctx.db.from('filter_decisions').insert(rows)
  let accuracySchemaReady = true

  if (isMissingAccuracyProvenance(decisionsError)) {
    accuracySchemaReady = false
    addAccuracySchemaWarning(ctx.warnings)
    console.error('[pipeline] migration 073 missing; blocking automated exclusions and pausing review sampling')
    const evidenceSafeRows = ctx.decisions.map((decision, index) => {
      const result = resultById.get(decision.fsn_result_id)
      const source = result?.source_db
      const parserVersion = source && source in EVIDENCE_ADAPTER_VERSIONS
        ? EVIDENCE_ADAPTER_VERSIONS[source as keyof typeof EVIDENCE_ADAPTER_VERSIONS]
        : null
      return {
        ...legacyRow(decision, ctx.runId, true),
        id: rows[index].id,
        authority_revision_id: result?.authority_revision_id ?? null,
        evidence_parser_version: result?.authority_revision_id ? parserVersion : null,
      }
    })
    const retry = await ctx.db.from('filter_decisions').insert(evidenceSafeRows)
    decisionsError = retry.error
    if (isMissingEvidenceLinkColumn(decisionsError)) {
      addEvidenceSchemaWarning(ctx.warnings)
      const noProvenanceRows = ctx.decisions.map((decision, index) => ({
        ...legacyRow(decision, ctx.runId, true), id: rows[index].id,
      }))
      const legacyRetry = await ctx.db.from('filter_decisions').insert(noProvenanceRows)
      decisionsError = legacyRetry.error
    }
  } else if (isMissingEvidenceLinkColumn(decisionsError)) {
    addEvidenceSchemaWarning(ctx.warnings)
    console.error('[pipeline] filter_decisions evidence-link columns missing; retrying legacy-compatible insert')
    const retry = await ctx.db.from('filter_decisions').insert(legacyRows)
    decisionsError = retry.error
  }

  if (decisionsError) throw new Error(`filter_decisions insert: ${decisionsError.message} (code=${decisionsError.code})`)
  if (!accuracySchemaReady) {
    ctx.timing.exclusion_sampling_status = 'paused_missing_migration_073'
    ctx.timing.exclusion_samples_selected = 0
    return
  }

  const samples = rows.flatMap((decisionRow, index) => {
    const sampleSource: SampleSource | null =
      decisionRow.decision_method === 'deterministic_scope' && decisionRow.decision === 'excluded'
        ? 'deterministic'
        : decisionRow.decision_method === 'ai_ranking' && decisionRow.presentation_rank === 'low'
          ? 'model_presentation'
          : null
    if (!sampleSource) return []
    const result = resultById.get(decisionRow.fsn_result_id)
    if (!result) throw new Error(`Sampling source result missing: ${decisionRow.fsn_result_id}`)
    const challenger = runDeterministicExclusionChallenger({
      title: result.title,
      manufacturer: result.manufacturer,
      rawContent: result.raw_content,
      profileDeviceName: ctx.profile.device_name,
      profileManufacturer: ctx.profile.manufacturer,
      competitorTerms: ctx.competitorTerms,
    })
    const sample = selectExclusionForReview({
      filterDecisionId: decisionRow.id,
      fsnResultId: decisionRow.fsn_result_id,
      searchRunId: ctx.runId,
      source: result.source_db ?? 'unknown',
      language: inferValidationLanguage(result.source_db ?? 'unknown'),
      deviceClass: ctx.profile.device_class ?? 'unknown',
      confidence: decisionRow.confidence,
      seriousEventSignal: hasSeriousEventLanguage(result.title, result.manufacturer, result.raw_content),
      challengerDecision: challenger.decision,
      challengerVersion: challenger.version,
      challengerReason: challenger.reason,
    }, ctx.runId, DEFAULT_EXCLUSION_SAMPLING_POLICY)
    return sample ? [{
      search_run_id: sample.searchRunId,
      fsn_result_id: sample.fsnResultId,
      filter_decision_id: sample.filterDecisionId,
      sample_source: sampleSource,
      policy_version: sample.policyVersion,
      inclusion_probability: sample.inclusionProbability,
      stratum: sample.stratum,
      eligible_arms: sample.eligibleArms,
      selected_by_arms: sample.selectedByArms,
      selection_reason: sample.selectionReason,
      draw_identifier: sample.drawIdentifier,
      draw_seed: sample.drawSeed,
      seed_hash: sample.seedHash,
      policy_snapshot: sample.policySnapshot,
      selection_context: {
        ...sample.selectionContext,
        sample_source: sampleSource,
        decision_method: decisionRow.decision_method,
        presentation_rank: decisionRow.presentation_rank,
        decision_index: index,
      },
      selected_at: sample.selectedAt,
    }] : []
  })

  if (samples.length > 0) {
    const { error: sampleError } = await ctx.db.from('exclusion_review_samples').insert(samples)
    if (sampleError) {
      if (isMissingAccuracyProvenance(sampleError)) {
        addAccuracySchemaWarning(ctx.warnings)
        ctx.timing.exclusion_sampling_status = 'paused_missing_migration_073'
        ctx.timing.exclusion_samples_selected = 0
        return
      }
      throw new Error(`exclusion review sample insert: ${sampleError.message} (code=${sampleError.code})`)
    }
  }
  ctx.timing.exclusion_sampling_status = 'active'
  ctx.timing.exclusion_sampling_policy_version = DEFAULT_EXCLUSION_SAMPLING_POLICY.version
  ctx.timing.exclusion_samples_selected = samples.length
}
