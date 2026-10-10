import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'
import type { ScrapedFsn, SourceAttachment } from '@/lib/scrapers/bfarm'

export interface CanonicalResult {
  canonical_id:    string
  /** Text or verified attachment bodies changed against a complete prior observation. */
  content_changed: boolean
  /** Verified attachment bodies changed (subset of content_changed). */
  attachment_changed: boolean
  is_new:          boolean
}

interface StoredCanonical {
  id: string
  content_hash: string
  revision_count: number
  first_seen_at: string
  title: string
  manufacturer: string | null
  product_name: string | null
  fsn_date: string | null
  source_url: string | null
  raw_content: string
  attachments: Json | null
  attachment_digest: string | null
  attachments_verified_at: string | null
  last_observation_degraded: boolean
}

export interface CanonicalTransition {
  changed: boolean
  attachmentChanged: boolean
  /** Keep the stored text instead of the incoming observation. */
  keepStoredText: boolean
  /** Keep the stored attachment state instead of the incoming one. */
  keepStoredAttachments: boolean
}

/**
 * Change semantics, independent of storage:
 *  - A degraded observation never replaces a complete stored one and never
 *    counts as a change.
 *  - A complete observation replacing a degraded one is a baseline upgrade,
 *    not an upstream change: the stored text was known to be partial.
 *  - Attachment change needs a verified digest on both sides. An unverified
 *    pass keeps the stored attachment state. A first verified digest is a
 *    baseline, not a change.
 */
export function classifyCanonicalTransition(
  prev: Pick<StoredCanonical, 'content_hash' | 'attachment_digest' | 'last_observation_degraded'> | undefined,
  incoming: { hash: string; degraded: boolean; attachmentDigest: string | null },
): CanonicalTransition {
  if (!prev) {
    return { changed: false, attachmentChanged: false, keepStoredText: false, keepStoredAttachments: false }
  }
  const keepStoredText = incoming.degraded && !prev.last_observation_degraded
  const textChanged = !keepStoredText
    && !incoming.degraded
    && !prev.last_observation_degraded
    && prev.content_hash !== incoming.hash
  const keepStoredAttachments = incoming.attachmentDigest === null
  const attachmentChanged = !keepStoredAttachments
    && prev.attachment_digest !== null
    && prev.attachment_digest !== incoming.attachmentDigest
  return {
    changed: textChanged || attachmentChanged,
    attachmentChanged,
    keepStoredText,
    keepStoredAttachments,
  }
}

function attachmentsJson(attachments: SourceAttachment[] | undefined): Json | null {
  if (!attachments || attachments.length === 0) return null
  return attachments.map(a => ({
    url: a.url,
    title: a.title ?? null,
    content_type: a.content_type ?? null,
    declared_size: a.declared_size ?? null,
    upstream_id: a.upstream_id ?? null,
    upstream_updated_at: a.upstream_updated_at ?? null,
    sha256: a.sha256 ?? null,
    byte_size: a.byte_size ?? null,
    retrieved_at: a.retrieved_at ?? null,
    status: a.status ?? 'listed',
  }))
}

export function attachmentsFromJson(value: Json | null | undefined): SourceAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: SourceAttachment[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const url = typeof entry.url === 'string' ? entry.url : null
    if (!url) continue
    out.push({
      url,
      title: typeof entry.title === 'string' ? entry.title : null,
      content_type: typeof entry.content_type === 'string' ? entry.content_type : null,
      declared_size: typeof entry.declared_size === 'number' ? entry.declared_size : null,
      upstream_id: typeof entry.upstream_id === 'string' ? entry.upstream_id : null,
      upstream_updated_at: typeof entry.upstream_updated_at === 'string' ? entry.upstream_updated_at : null,
      // Stored hashes are history, not this pass's verification.
      status: 'listed',
    })
  }
  return out.length > 0 ? out : undefined
}

export { attachmentsJson }

// ─── Hash ─────────────────────────────────────────────────────────────────────

function normalizeText(s: string): string {
  // NFC + collapse internal whitespace runs to single space + trim.
  // Defensive: BfArM HTML parsing can produce variable internal whitespace
  // depending on scraper version. Without this, a whitespace-only change
  // in the source HTML produces a false content_changed=true.
  // Attachment bodies are tracked separately (attachment_digest), so a PDF
  // replaced at an unchanged URL is detected without changing this text hash.
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

export function computeContentHash(item: ScrapedFsn): string {
  return createHash('sha256')
    .update(JSON.stringify({
      title:        normalizeText(item.title),
      manufacturer: normalizeText(item.manufacturer ?? ''),
      fsn_date:     item.fsn_date ?? '',
      raw_content:  normalizeText(item.raw_content),
    }))
    .digest('hex')
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

// Upserts a batch of scraped items into fsn_canonical.
// Returns one CanonicalResult per item (same order).
export async function upsertCanonical(items: ScrapedFsn[]): Promise<CanonicalResult[]> {
  if (items.length === 0) return []

  const db = createAdminClient()

  // Fetch existing rows for this batch to detect changes.
  // Batch by source to get exact (source, source_record_id) pairs.
  // A single query with .in('source', …).in('source_record_id', …) produces a
  // cross-product (any source × any record_id), which can match rows belonging
  // to the wrong source. Querying per-source with .eq('source', s) avoids this.
  const keys = items.map(i => `${i.source_db}:::${i.external_id}`)

  const sourceGroups = new Map<string, string[]>()
  for (const item of items) {
    const group = sourceGroups.get(item.source_db) ?? []
    group.push(item.external_id)
    sourceGroups.set(item.source_db, group)
  }

  const existingMap = new Map<string, StoredCanonical>()

  for (const [source, recordIds] of sourceGroups) {
    const { data, error } = await db
      .from('fsn_canonical')
      .select('id, source, source_record_id, content_hash, revision_count, first_seen_at, title, manufacturer, product_name, fsn_date, source_url, raw_content, attachments, attachment_digest, attachments_verified_at, last_observation_degraded')
      .eq('source', source)
      .in('source_record_id', recordIds)

    // A failed read would turn every record into "new" and hide changes.
    if (error) throw new Error(`fsn_canonical read failed for ${source}: ${error.code ?? 'unknown'}`)

    for (const row of data ?? []) {
      existingMap.set(`${row.source}:::${row.source_record_id}`, row)
    }
  }

  const now = new Date().toISOString()
  const results: CanonicalResult[] = []

  const upsertRows = items.map((item, idx) => {
    const key     = keys[idx]
    const hash    = computeContentHash(item)
    const prev    = existingMap.get(key)
    const isNew   = !prev
    const digest  = item.attachment_digest ?? null
    const transition = classifyCanonicalTransition(prev, {
      hash,
      degraded: item.observation_degraded === true,
      attachmentDigest: digest,
    })

    results.push({
      canonical_id:       prev?.id ?? '',  // filled in after upsert
      content_changed:    transition.changed,
      attachment_changed: transition.attachmentChanged,
      is_new:             isNew,
    })

    // Always include revision_count and first_seen_at explicitly.
    // Omitting revision_count causes PostgREST to write EXCLUDED.revision_count=null
    // on the UPDATE path, violating the NOT NULL constraint.
    // first_seen_at must always be present: for new rows it is `now`, for existing
    // rows it is the value already stored — omitting it on UPDATE would null it out.
    const revisionCount = isNew ? 1 : transition.changed ? (prev!.revision_count + 1) : prev!.revision_count

    const text = transition.keepStoredText && prev
      ? {
          title:        prev.title,
          manufacturer: prev.manufacturer,
          product_name: prev.product_name,
          fsn_date:     prev.fsn_date,
          source_url:   prev.source_url ?? item.source_url,
          raw_content:  prev.raw_content,
          content_hash: prev.content_hash,
          last_observation_degraded: false,
        }
      : {
          title:        item.title,
          manufacturer: item.manufacturer ?? null,
          product_name: item.product_name ?? null,
          fsn_date:     item.fsn_date     ?? null,
          source_url:   item.source_url,
          raw_content:  item.raw_content,
          content_hash: hash,
          last_observation_degraded: item.observation_degraded === true,
        }

    const attachmentState = transition.keepStoredAttachments
      ? {
          attachments:             prev?.attachments ?? attachmentsJson(item.attachments),
          attachment_digest:       prev?.attachment_digest ?? null,
          attachments_verified_at: prev?.attachments_verified_at ?? null,
        }
      : {
          attachments:             attachmentsJson(item.attachments),
          attachment_digest:       digest,
          attachments_verified_at: now,
        }

    return {
      source:           item.source_db,
      source_record_id: item.external_id,
      ...text,
      ...attachmentState,
      last_seen_at:     now,
      revision_count:   revisionCount,
      first_seen_at:    prev?.first_seen_at ?? now,
    }
  })

  const { data: upserted, error } = await db
    .from('fsn_canonical')
    .upsert(upsertRows, { onConflict: 'source,source_record_id' })
    .select('id, source, source_record_id')

  if (error) throw error

  // Back-fill canonical_ids from upsert response
  const upsertedMap = new Map<string, string>()
  for (const row of upserted ?? []) {
    upsertedMap.set(`${row.source}:::${row.source_record_id}`, row.id)
  }

  for (let i = 0; i < results.length; i++) {
    const key = keys[i]
    const id  = upsertedMap.get(key) ?? existingMap.get(key)?.id ?? ''
    results[i].canonical_id = id
  }

  return results
}

// ─── Read ─────────────────────────────────────────────────────────────────────

// Fetches canonical items for a source within a date range (from covered storage).
export async function getCanonicalItems(
  source: string,
  fromDate: string,
  toDate: string,
): Promise<ScrapedFsn[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('fsn_canonical')
    .select('source_record_id, title, manufacturer, product_name, fsn_date, source_url, raw_content, attachments, last_observation_degraded')
    .eq('source', source)
    .gte('fsn_date', fromDate)
    .lte('fsn_date', toDate)

  if (error || !data) return []

  return data.map(row => ({
    external_id:  row.source_record_id as string,
    title:        row.title            as string,
    manufacturer: row.manufacturer     as string | null,
    product_name: row.product_name     as string | null,
    fsn_date:     row.fsn_date         as string | null,
    source_url:   row.source_url       as string,
    raw_content:  row.raw_content      as string,
    source_db:    source,
    // Re-verify documents of covered records: an authority can replace a PDF
    // without the notice re-entering the live listing window.
    ...(attachmentsFromJson(row.attachments) ? { attachments: attachmentsFromJson(row.attachments) } : {}),
    ...(row.last_observation_degraded ? { observation_degraded: true } : {}),
  }))
}
