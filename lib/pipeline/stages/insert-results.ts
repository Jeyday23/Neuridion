import { computeContentHash } from '@/lib/sync/canonical'
import type { PipelineContext } from '../types'

export async function insertResultsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.items.length === 0) return

  const { data: inserted, error: insertError } = await ctx.db
    .from('fsn_results')
    .insert(ctx.items.map((item) => ({
      run_id:       ctx.runId,
      external_id:  item.external_id,
      title:        item.title,
      manufacturer: item.manufacturer ?? '',
      fsn_date:     item.fsn_date || null,
      source_url:   item.source_url,
      raw_content:  item.raw_content,
      source_db:    item.source_db,
      content_hash: computeContentHash(item),
      canonical_id: ctx.canonicalIds.get(item.external_id) ?? null,
    })))
    .select('id, external_id, title, manufacturer, raw_content, fsn_date, source_db')

  if (insertError) throw new Error(`fsn_results insert: ${insertError.message} (code=${insertError.code})`)
  ctx.insertedRows = inserted ?? []
}
