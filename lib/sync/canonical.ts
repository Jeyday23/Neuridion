import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

export interface CanonicalResult {
  canonical_id:    string
  content_changed: boolean
  is_new:          boolean
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

function normalizeText(s: string): string {
  // NFC + collapse internal whitespace runs to single space + trim.
  // Defensive: BfArM HTML parsing can produce variable internal whitespace
  // depending on scraper version. Without this, a whitespace-only change
  // in the source HTML produces a false content_changed=true.
  // TODO(backlog): hash does not include attachment URLs (PDFs). A regulator
  // updating an attached PDF without changing visible text will not be detected.
  // See BACKLOG.md "Attachment-aware hashing".
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
  // Filter by both source AND source_record_id — never pull all rows for a source.
  const keys = items.map(i => `${i.source_db}:::${i.external_id}`)
  const { data: existing } = await db
    .from('fsn_canonical')
    .select('id, source, source_record_id, content_hash, revision_count, first_seen_at')
    .in('source', [...new Set(items.map(i => i.source_db))])
    .in('source_record_id', items.map(i => i.external_id))

  // Build lookup: "source:::source_record_id" → existing row
  const existingMap = new Map<string, {
    id: string
    content_hash: string
    revision_count: number
    first_seen_at: string
  }>()
  for (const row of existing ?? []) {
    existingMap.set(`${row.source}:::${row.source_record_id}`, {
      id:             row.id,
      content_hash:   row.content_hash,
      revision_count: row.revision_count,
      first_seen_at:  row.first_seen_at,
    })
  }

  const now = new Date().toISOString()
  const results: CanonicalResult[] = []

  const upsertRows = items.map((item, idx) => {
    const key     = keys[idx]
    const hash    = computeContentHash(item)
    const prev    = existingMap.get(key)
    const isNew   = !prev
    const changed = prev ? prev.content_hash !== hash : false

    results.push({
      canonical_id:    prev?.id ?? '',  // filled in after upsert
      content_changed: changed,
      is_new:          isNew,
    })

    // Always include revision_count and first_seen_at explicitly.
    // Omitting revision_count causes PostgREST to write EXCLUDED.revision_count=null
    // on the UPDATE path, violating the NOT NULL constraint.
    // first_seen_at must always be present: for new rows it is `now`, for existing
    // rows it is the value already stored — omitting it on UPDATE would null it out.
    const revisionCount = isNew ? 1 : changed ? (prev!.revision_count + 1) : prev!.revision_count

    return {
      source:           item.source_db,
      source_record_id: item.external_id,
      title:            item.title,
      manufacturer:     item.manufacturer ?? null,
      product_name:     item.product_name ?? null,
      fsn_date:         item.fsn_date     ?? null,
      source_url:       item.source_url,
      raw_content:      item.raw_content,
      content_hash:     hash,
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
    .select('source_record_id, title, manufacturer, product_name, fsn_date, source_url, raw_content')
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
  }))
}
