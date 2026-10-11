import { createHash } from 'crypto'
import type { Json } from '@/types/supabase'
import type { AttachmentStatus, ScrapedFsn, SourceAttachment } from '@/lib/scrapers/bfarm'

/**
 * Source document monitoring.
 *
 * Authorities can replace an attached PDF at the same URL. A URL list or the
 * notice text cannot show that, so every listed attachment is fetched (or
 * revalidated with HTTP validators) and hashed. The resulting digest is
 * compared against the stored record to decide whether the evidence changed.
 *
 * Contract:
 *   - A digest is produced only when every attachment of a record was
 *     verified in this pass. Partial verification yields null, never a digest
 *     over a subset, so a failed download cannot look like a change or like
 *     "unchanged".
 *   - Every distinct body (sha256) per record and URL is appended to
 *     source_document_versions. Nothing is updated or deleted.
 *   - Failures surface as coverage-affecting warnings.
 */

export const DOCUMENT_MONITOR_VERSION = 'document-monitor-v1'
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_CONCURRENCY = 4
const DEFAULT_MAX_DOCUMENTS = 2_000
const MAX_REDIRECTS = 3
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

export const MONITORED_DOCUMENT_HOSTS: Record<string, ReadonlySet<string>> = {
  mhra: new Set(['www.gov.uk', 'assets.publishing.service.gov.uk']),
}

export interface KnownDocumentVersion {
  id: string
  sha256: string
  etag: string | null
  last_modified: string | null
  byte_size: number | null
}

export interface NewDocumentVersion {
  source: string
  source_record_id: string
  document_url: string
  sha256: string
  byte_size: number | null
  content_type: string | null
  etag: string | null
  last_modified: string | null
  upstream_metadata: Json
  previous_version_id: string | null
  storage_path: string | null
}

export interface DocumentVersionStore {
  latest(source: string, recordIds: string[]): Promise<Map<string, KnownDocumentVersion>>
  append(rows: NewDocumentVersion[]): Promise<void>
  archive?(path: string, bytes: Uint8Array, contentType: string | null): Promise<boolean>
}

export type FetchedDocument =
  | { status: 'retrieved'; sha256: string; byteSize: number; contentType: string | null; etag: string | null; lastModified: string | null; bytes?: Uint8Array }
  | { status: 'not_modified' }
  | { status: 'missing' | 'failed' | 'too_large' | 'blocked'; detail: string }

export interface DocumentFetcher {
  (url: string, known: KnownDocumentVersion | undefined, options: { signal?: AbortSignal; keepBytes: boolean }): Promise<FetchedDocument>
}

export interface VerifyOptions {
  store: DocumentVersionStore
  fetcher?: DocumentFetcher
  now?: () => Date
  signal?: AbortSignal
  concurrency?: number
  maxDocuments?: number
  archiveBytes?: boolean
}

export interface VerifiedRecord {
  attachments: SourceAttachment[]
  digest: string | null
  complete: boolean
}

export interface VerifyResult {
  records: Map<string, VerifiedRecord>
  warnings: string[]
  counts: Record<AttachmentStatus, number>
  newVersions: number
}

export function documentKey(recordId: string, url: string): string {
  return `${recordId}\u0000${url}`
}

/**
 * Order-independent digest over (url, sha256). Null unless every attachment
 * has a verified body hash.
 */
export function computeAttachmentDigest(attachments: SourceAttachment[] | undefined): string | null {
  if (!attachments || attachments.length === 0) return null
  if (attachments.some(a => !a.sha256 || !/^[0-9a-f]{64}$/.test(a.sha256))) return null
  const pairs = attachments
    .map(a => [a.url, a.sha256 as string] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex')
}

function isAllowed(source: string, url: string): boolean {
  const hosts = MONITORED_DOCUMENT_HOSTS[source]
  if (!hosts) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && hosts.has(parsed.hostname)
  } catch {
    return false
  }
}

export function createHttpDocumentFetcher(
  source: string,
  options: { maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): DocumentFetcher {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch

  return async (url, known, { signal, keepBytes }) => {
    let target = url
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (!isAllowed(source, target)) return { status: 'blocked', detail: 'host not allowed' }
        const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' }
        if (known?.sha256 && known.etag) headers['If-None-Match'] = known.etag
        if (known?.sha256 && known.last_modified) headers['If-Modified-Since'] = known.last_modified

        const res = await fetchImpl(target, { headers, redirect: 'manual', signal: combined })
        if (res.status >= 300 && res.status < 400 && res.status !== 304) {
          const location = res.headers.get('location')
          if (!location) return { status: 'failed', detail: `HTTP ${res.status} without location` }
          target = new URL(location, target).toString()
          continue
        }
        if (res.status === 304) {
          if (!known?.sha256) return { status: 'failed', detail: 'HTTP 304 without a stored version' }
          return { status: 'not_modified' }
        }
        if (res.status === 404 || res.status === 410) return { status: 'missing', detail: `HTTP ${res.status}` }
        if (!res.ok || !res.body) return { status: 'failed', detail: `HTTP ${res.status}` }

        const declared = Number(res.headers.get('content-length'))
        if (Number.isFinite(declared) && declared > maxBytes) {
          await res.body.cancel().catch(() => undefined)
          return { status: 'too_large', detail: `${declared} bytes` }
        }

        const hash = createHash('sha256')
        const chunks: Uint8Array[] = []
        let size = 0
        const reader = res.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) {
            await reader.cancel().catch(() => undefined)
            return { status: 'too_large', detail: `over ${maxBytes} bytes` }
          }
          hash.update(value)
          if (keepBytes) chunks.push(value)
        }
        return {
          status: 'retrieved',
          sha256: hash.digest('hex'),
          byteSize: size,
          contentType: res.headers.get('content-type'),
          etag: res.headers.get('etag'),
          lastModified: res.headers.get('last-modified'),
          ...(keepBytes ? { bytes: concat(chunks, size) } : {}),
        }
      }
      return { status: 'failed', detail: 'too many redirects' }
    } catch (err) {
      if (signal?.aborted) throw err
      return { status: 'failed', detail: err instanceof Error ? err.name : 'fetch error' }
    }
  }
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]
      await run(current)
    }
  })
  await Promise.all(workers)
}

function emptyCounts(): Record<AttachmentStatus, number> {
  return { listed: 0, retrieved: 0, not_modified: 0, failed: 0, missing: 0, too_large: 0, blocked: 0 }
}

/**
 * Verifies every listed attachment of the given records for one source.
 * Records without attachments are not returned.
 */
export async function verifySourceDocuments(
  source: string,
  items: ScrapedFsn[],
  options: VerifyOptions,
): Promise<VerifyResult> {
  const now = options.now ?? (() => new Date())
  const counts = emptyCounts()
  const records = new Map<string, VerifiedRecord>()
  const warnings: string[] = []
  const withDocs = items.filter(item => (item.attachments?.length ?? 0) > 0)
  if (withDocs.length === 0) return { records, warnings, counts, newVersions: 0 }

  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS
  const fetcher = options.fetcher ?? createHttpDocumentFetcher(source)
  const keepBytes = Boolean(options.archiveBytes && options.store.archive)

  let known: Map<string, KnownDocumentVersion>
  try {
    known = await options.store.latest(source, [...new Set(withDocs.map(item => item.external_id))])
  } catch {
    known = new Map()
    warnings.push(`${source.toUpperCase()}: stored document versions could not be loaded; every attachment was downloaded in full.`)
  }

  type Job = { item: ScrapedFsn; index: number; attachment: SourceAttachment }
  const jobs: Job[] = []
  const verifiedByItem = new Map<string, SourceAttachment[]>()
  for (const item of withDocs) {
    const list = (item.attachments ?? []).map(a => ({ ...a, sha256: null, byte_size: null, retrieved_at: null, status: 'listed' as AttachmentStatus }))
    verifiedByItem.set(item.external_id, list)
    list.forEach((attachment, index) => jobs.push({ item, index, attachment }))
  }

  const skipped = jobs.length > maxDocuments ? jobs.splice(maxDocuments) : []
  counts.listed += skipped.length

  const pending: NewDocumentVersion[] = []
  await mapLimit(jobs, options.concurrency ?? DEFAULT_CONCURRENCY, async ({ item, index, attachment }) => {
    const target = verifiedByItem.get(item.external_id)!
    const prior = known.get(documentKey(item.external_id, attachment.url))
    const fetched = await fetcher(attachment.url, prior, { signal: options.signal, keepBytes })
    const retrievedAt = now().toISOString()

    if (fetched.status === 'not_modified') {
      target[index] = { ...attachment, sha256: prior!.sha256, byte_size: prior!.byte_size, retrieved_at: retrievedAt, status: 'not_modified' }
      counts.not_modified++
      return
    }
    if (fetched.status !== 'retrieved') {
      target[index] = { ...attachment, retrieved_at: retrievedAt, status: fetched.status }
      counts[fetched.status]++
      return
    }

    target[index] = {
      ...attachment,
      sha256: fetched.sha256,
      byte_size: fetched.byteSize,
      content_type: attachment.content_type ?? fetched.contentType,
      retrieved_at: retrievedAt,
      status: 'retrieved',
    }
    counts.retrieved++

    if (prior?.sha256 === fetched.sha256) return
    let storagePath: string | null = null
    if (keepBytes && fetched.bytes && options.store.archive) {
      const path = `source-documents/${source}/${fetched.sha256}`
      storagePath = await options.store.archive(path, fetched.bytes, fetched.contentType).catch(() => false) ? path : null
    }
    pending.push({
      source,
      source_record_id: item.external_id,
      document_url: attachment.url,
      sha256: fetched.sha256,
      byte_size: fetched.byteSize,
      content_type: fetched.contentType,
      etag: fetched.etag,
      last_modified: fetched.lastModified,
      upstream_metadata: {
        monitor_version: DOCUMENT_MONITOR_VERSION,
        title: attachment.title ?? null,
        declared_size: attachment.declared_size ?? null,
        upstream_id: attachment.upstream_id ?? null,
        upstream_updated_at: attachment.upstream_updated_at ?? null,
      },
      previous_version_id: prior?.id ?? null,
      storage_path: storagePath,
    })
  })

  // A new body whose history could not be written must not become the
  // current state: the change would be visible but not auditable.
  const unrecorded = new Set<string>()
  if (pending.length > 0) {
    try {
      await options.store.append(pending)
    } catch {
      pending.forEach(row => unrecorded.add(row.source_record_id))
      warnings.push(`${source.toUpperCase()}: ${pending.length} new document version(s) were detected but their history could not be stored.`)
    }
  }

  for (const item of withDocs) {
    const attachments = verifiedByItem.get(item.external_id)!
    const digest = unrecorded.has(item.external_id) ? null : computeAttachmentDigest(attachments)
    records.set(item.external_id, { attachments, digest, complete: digest !== null })
  }

  const unverified = counts.failed + counts.missing + counts.too_large + counts.blocked + counts.listed
  if (unverified > 0) {
    const parts = [
      counts.failed ? `${counts.failed} failed` : '',
      counts.missing ? `${counts.missing} no longer available upstream` : '',
      counts.too_large ? `${counts.too_large} over the size limit` : '',
      counts.blocked ? `${counts.blocked} on a non-authority host` : '',
      counts.listed ? `${counts.listed} not checked (per-run document limit reached)` : '',
    ].filter(Boolean).join(', ')
    warnings.push(
      `${source.toUpperCase()}: ${unverified} attachment(s) could not be verified (${parts}); ` +
      'document change detection is incomplete for the affected notices.',
    )
  }

  return { records, warnings, counts, newVersions: unrecorded.size > 0 ? 0 : pending.length }
}
