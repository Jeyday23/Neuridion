import { randomUUID } from 'crypto'
import type { PipelineContext } from '../types'
import { EVIDENCE_ADAPTER_VERSIONS } from '@/lib/evidence/constants'
import { addEvidenceSchemaWarning, isMissingEvidenceLinkColumn } from '../schema-compat'
import {
  DEFAULT_EXCLUSION_SAMPLING_POLICY,
  hasSeriousEventLanguage,
  inferValidationLanguage,
  runDeterministicExclusionChallenger,
  selectExclusionForReview,
} from '@/lib/validation/exclusion-sampling'

export async function persistDecisionsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.decisions.length === 0) return
  const resultById = new Map(ctx.insertedRows.map((row) => [row.id, row]))

  const legacyRows = ctx.decisions.map((d) => ({
    id:            randomUUID(),
    fsn_result_id: d.fsn_result_id,
    search_run_id: ctx.runId,
    decision:      d.decision,
    rationale:     d.rationale,
    confidence:    d.confidence ?? 0,
    model_used:    d.model,
    stage:         'stage1',
  }))
  const rows = ctx.decisions.map((d, index) => {
      const result = resultById.get(d.fsn_result_id)
      const source = result?.source_db
      const parserVersion = source && source in EVIDENCE_ADAPTER_VERSIONS
        ? EVIDENCE_ADAPTER_VERSIONS[source as keyof typeof EVIDENCE_ADAPTER_VERSIONS]
        : null
      return {
        ...legacyRows[index],
        authority_revision_id: result?.authority_revision_id ?? null,
        evidence_parser_version: result?.authority_revision_id ? parserVersion : null,
      }
    })

  let { error: decisionsError } = await ctx.db.from('filter_decisions').insert(rows)
  if (isMissingEvidenceLinkColumn(decisionsError)) {
    addEvidenceSchemaWarning(ctx.warnings)
    console.error('[pipeline] filter_decisions evidence-link columns missing; retrying legacy-compatible insert')
    const retry = await ctx.db.from('filter_decisions').insert(legacyRows)
    decisionsError = retry.error
  }
  if (decisionsError) throw new Error(`filter_decisions insert: ${decisionsError.message} (code=${decisionsError.code})`)

  // Sampling happens only after the exact append-only model decision exists.
  // Every selected exclusion carries its probability and frozen policy at this
  // moment; migration 072 atomically creates the corresponding review gate.
  const samples = rows.flatMap((decisionRow) => {
    if (decisionRow.decision !== 'excluded') return []
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
      seriousEventSignal: hasSeriousEventLanguage(
        result.title,
        result.manufacturer,
        result.raw_content,
      ),
      challengerDecision: challenger.decision,
      challengerVersion: challenger.version,
      challengerReason: challenger.reason,
    }, ctx.runId, DEFAULT_EXCLUSION_SAMPLING_POLICY)

    return sample ? [{
      search_run_id: sample.searchRunId,
      fsn_result_id: sample.fsnResultId,
      filter_decision_id: sample.filterDecisionId,
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
      selection_context: sample.selectionContext,
      selected_at: sample.selectedAt,
    }] : []
  })

  if (samples.length > 0) {
    const { error: sampleError } = await ctx.db.from('exclusion_review_samples').insert(samples)
    if (sampleError) {
      throw new Error(`exclusion review sample insert: ${sampleError.message} (code=${sampleError.code})`)
    }
  }

  ctx.timing.exclusion_sampling_policy_version = DEFAULT_EXCLUSION_SAMPLING_POLICY.version
  ctx.timing.exclusion_samples_selected = samples.length
}
