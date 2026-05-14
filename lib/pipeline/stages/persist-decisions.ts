import type { PipelineContext } from '../types'

export async function persistDecisionsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.decisions.length === 0) return

  const { error: decisionsError } = await ctx.db.from('filter_decisions').insert(
    ctx.decisions.map((d) => ({
      fsn_result_id: d.fsn_result_id,
      search_run_id: ctx.runId,
      decision:      d.decision,
      rationale:     d.rationale,
      confidence:    d.confidence,
      model_used:    d.model,
      stage:         'stage1',
    })),
  )
  if (decisionsError) throw new Error(`filter_decisions insert: ${decisionsError.message} (code=${decisionsError.code})`)
}
