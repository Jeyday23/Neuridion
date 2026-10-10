import { createAdminClient } from '@/lib/supabase/admin'
import { EVIDENCE_BUCKET } from '@/lib/evidence/constants'
import { documentKey, type DocumentVersionStore, type KnownDocumentVersion } from './document-monitor'

const RECORD_BATCH = 150

/** Service-role store for source_document_versions (append-only). */
export function createSupabaseDocumentVersionStore(): DocumentVersionStore {
  const db = createAdminClient()
  return {
    async latest(source, recordIds) {
      const latest = new Map<string, KnownDocumentVersion>()
      for (let i = 0; i < recordIds.length; i += RECORD_BATCH) {
        const batch = recordIds.slice(i, i + RECORD_BATCH)
        const { data, error } = await db
          .from('source_document_versions')
          .select('id, source_record_id, document_url, sha256, etag, last_modified, byte_size, first_retrieved_at')
          .eq('source', source)
          .in('source_record_id', batch)
          .order('first_retrieved_at', { ascending: false })
        if (error) throw new Error(`document versions unavailable: ${error.code ?? 'unknown'}`)
        for (const row of data ?? []) {
          const key = documentKey(row.source_record_id, row.document_url)
          if (!latest.has(key)) {
            latest.set(key, {
              id: row.id,
              sha256: row.sha256,
              etag: row.etag,
              last_modified: row.last_modified,
              byte_size: row.byte_size,
            })
          }
        }
      }
      return latest
    },
    async append(rows) {
      const { error } = await db
        .from('source_document_versions')
        .upsert(rows, { onConflict: 'source,source_record_id,document_url,sha256', ignoreDuplicates: true })
      if (error) throw new Error(`document version insert failed: ${error.code ?? 'unknown'}`)
    },
    async archive(path, bytes, contentType) {
      const { error } = await db.storage.from(EVIDENCE_BUCKET).upload(path, bytes, {
        contentType: contentType ?? 'application/octet-stream',
        upsert: false,
      })
      // An existing object with the same sha256 path is the same bytes.
      return !error || /exists|duplicate/i.test(error.message)
    },
  }
}
