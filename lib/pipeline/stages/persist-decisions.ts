import type { PipelineContext } from '../types'
import { EVIDENCE_ADAPTER_VERSIONS } from '@/lib/evidence/constants'

export async function persistDecisionsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.decisions.length === 0) return
  const resultById = new Map(ctx.insertedRows.map((row) => [row.id, row]))

  const { error: decisionsError } = await ctx.db.from('filter_decisions').insert(
    ctx.decisions.map((d) => {
      const result = resultById.get(d.fsn_result_id)
      const source = result?.source_db
      const parserVersion = source && source in EVIDENCE_ADAPTER_VERSIONS
        ? EVIDENCE_ADAPTER_VERSIONS[source as keyof typeof EVIDENCE_ADAPTER_VERSIONS]
        : null
      return {
        fsn_result_id: d.fsn_result_id,
        search_run_id: ctx.runId,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence ?? 0,
        model_used:    d.model,
        stage:         'stage1',
        authority_revision_id: result?.authority_revision_id ?? null,
        evidence_parser_version: result?.authority_revision_id ? parserVersion : null,
      }
    }),
  )
  if (decisionsError) throw new Error(`filter_decisions insert: ${decisionsError.message} (code=${decisionsError.code})`)
}
