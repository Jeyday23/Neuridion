import type { PipelineContext } from '../types'
import { EVIDENCE_ADAPTER_VERSIONS } from '@/lib/evidence/constants'
import { addEvidenceSchemaWarning, isMissingEvidenceLinkColumn } from '../schema-compat'

export async function persistDecisionsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.decisions.length === 0) return
  const resultById = new Map(ctx.insertedRows.map((row) => [row.id, row]))

  const legacyRows = ctx.decisions.map((d) => ({
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
}
