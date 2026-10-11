import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import { createHttpDocumentFetcher, MONITORED_DOCUMENT_HOSTS, verifySourceDocuments, type DocumentVersionStore } from './document-monitor'
import { createSupabaseDocumentVersionStore } from './document-version-store'

export interface DocumentCheckSummary {
  warnings: string[]
  /** True when at least one listed attachment could not be verified. */
  incomplete: boolean
  checkedRecords: number
  newVersions: number
}

export function documentMonitoringEnabledFor(source: string): boolean {
  if (process.env.SOURCE_DOCUMENT_MONITORING === 'false') return false
  return source in MONITORED_DOCUMENT_HOSTS
}

/**
 * Verifies attachment bodies in place: sets `attachments` (with sha256 and
 * status) and `attachment_digest` on each record that lists documents.
 * Must run before upsertCanonical so change detection sees the digest.
 */
export async function verifyDocumentsForSource(
  source: string,
  items: ScrapedFsn[],
  options: { signal?: AbortSignal; store?: DocumentVersionStore } = {},
): Promise<DocumentCheckSummary> {
  if (!documentMonitoringEnabledFor(source)) {
    return { warnings: [], incomplete: false, checkedRecords: 0, newVersions: 0 }
  }
  const result = await verifySourceDocuments(source, items, {
    store: options.store ?? createSupabaseDocumentVersionStore(),
    fetcher: createHttpDocumentFetcher(source),
    signal: options.signal,
    archiveBytes: process.env.SOURCE_DOCUMENT_ARCHIVE === 'true',
  })
  for (const item of items) {
    const verified = result.records.get(item.external_id)
    if (!verified) continue
    item.attachments = verified.attachments
    item.attachment_digest = verified.digest
  }
  const incomplete = [...result.records.values()].some(record => !record.complete)
  return {
    warnings: result.warnings,
    incomplete,
    checkedRecords: result.records.size,
    newVersions: result.newVersions,
  }
}
