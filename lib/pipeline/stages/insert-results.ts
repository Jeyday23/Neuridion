import { computeContentHash } from '@/lib/sync/canonical'
import type { PipelineContext } from '../types'
import { addEvidenceSchemaWarning, isMissingEvidenceLinkColumn } from '../schema-compat'

function withoutAuthorityRevision<T extends { authority_revision_id: unknown }>(
  row: T,
): Omit<T, 'authority_revision_id'> {
  const copy = { ...row } as T & { authority_revision_id?: unknown }
  delete copy.authority_revision_id
  return copy
}

export async function insertResultsStage(ctx: PipelineContext): Promise<void> {
  if (ctx.items.length === 0) return

  const rows = ctx.items.map((item) => ({
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
    authority_revision_id: ctx.authorityRevisionIds?.get(item.external_id) ?? null,
  }))

  const CHUNK = 200
  const allInserted: typeof ctx.insertedRows = []

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    let { data: inserted, error: insertError } = await ctx.db
      .from('fsn_results')
      .insert(chunk)
      .select('id, authority_revision_id, external_id, title, manufacturer, raw_content, fsn_date, source_db, source_url')

    if (isMissingEvidenceLinkColumn(insertError)) {
      addEvidenceSchemaWarning(ctx.warnings)
      console.error('[pipeline] fsn_results evidence-link column missing; retrying legacy-compatible insert')
      const legacyChunk = chunk.map(withoutAuthorityRevision)
      const retry = await ctx.db
        .from('fsn_results')
        .insert(legacyChunk)
        .select('id, external_id, title, manufacturer, raw_content, fsn_date, source_db, source_url')
      insertError = retry.error
      inserted = retry.data?.map((row) => ({ ...row, authority_revision_id: null })) ?? null
    }

    if (insertError) throw new Error(`fsn_results insert: ${insertError.message} (code=${insertError.code})`)
    if (inserted) allInserted.push(...inserted)
  }

  ctx.insertedRows.push(...allInserted)
}
