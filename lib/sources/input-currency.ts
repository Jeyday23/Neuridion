import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Input currency: whether the source records a run screened are still the
 * current stored versions. Read-time only. Approved runs stay immutable; a
 * superseded input is reported, and the remedy is a new search.
 */

export type InputCurrencyStatus =
  | 'current'
  | 'record_changed'
  | 'documents_changed'
  | 'record_and_documents_changed'
  | 'unknown'

export interface ScreenedInput {
  id: string
  canonical_id: string | null
  content_hash: string | null
  attachment_digest: string | null
}

export interface CurrentInput {
  id: string
  content_hash: string
  attachment_digest: string | null
  revision_count: number
  last_seen_at: string | null
}

export interface ResultCurrency {
  status: InputCurrencyStatus
  current_revision: number | null
  last_seen_at: string | null
}

export interface InputCurrencySummary {
  total: number
  current: number
  changed: number
  record_changed: number
  documents_changed: number
  unknown: number
}

export interface InputCurrencyAssessment {
  byResult: Map<string, ResultCurrency>
  summary: InputCurrencySummary
  warnings: string[]
}

export function assessInputCurrency(
  screened: ScreenedInput[],
  current: Map<string, CurrentInput>,
): InputCurrencyAssessment {
  const byResult = new Map<string, ResultCurrency>()
  const summary: InputCurrencySummary = {
    total: screened.length, current: 0, changed: 0, record_changed: 0, documents_changed: 0, unknown: 0,
  }

  for (const row of screened) {
    const now = row.canonical_id ? current.get(row.canonical_id) : undefined
    if (!now || !row.content_hash) {
      byResult.set(row.id, { status: 'unknown', current_revision: null, last_seen_at: null })
      summary.unknown++
      continue
    }
    const recordChanged = now.content_hash !== row.content_hash
    // Both sides must hold a verified digest. A missing digest on either side
    // means "not verified", not "changed".
    const documentsChanged = row.attachment_digest !== null
      && now.attachment_digest !== null
      && row.attachment_digest !== now.attachment_digest
    const status: InputCurrencyStatus = recordChanged && documentsChanged
      ? 'record_and_documents_changed'
      : recordChanged ? 'record_changed'
        : documentsChanged ? 'documents_changed'
          : 'current'
    byResult.set(row.id, { status, current_revision: now.revision_count, last_seen_at: now.last_seen_at })
    if (status === 'current') {
      summary.current++
    } else {
      summary.changed++
      if (recordChanged) summary.record_changed++
      if (documentsChanged) summary.documents_changed++
    }
  }

  const warnings: string[] = []
  if (summary.changed > 0) {
    warnings.push(
      `${summary.changed} of ${summary.total} screened source record(s) have a newer stored version than the one this search screened` +
      (summary.documents_changed > 0 ? ` (${summary.documents_changed} with changed attached documents)` : '') +
      '. Conclusions for those records rest on superseded inputs; run a new search to screen the current versions.',
    )
  }
  if (summary.unknown > 0) {
    warnings.push(
      `${summary.unknown} of ${summary.total} screened source record(s) have no stored current version to compare; their currency is not verified.`,
    )
  }
  return { byResult, summary, warnings }
}

const PAGE = 1000
const ID_BATCH = 200

/** Loads screened vs current versions for one run with the service-role client. */
export async function loadRunInputCurrency(
  db: SupabaseClient<Database>,
  runId: string,
): Promise<InputCurrencyAssessment> {
  const screened: ScreenedInput[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('fsn_results')
      .select('id, canonical_id, content_hash, attachment_digest')
      .eq('run_id', runId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`input currency: results unavailable (${error.code ?? 'unknown'})`)
    screened.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const canonicalIds = [...new Set(screened.map(row => row.canonical_id).filter((id): id is string => Boolean(id)))]
  const current = new Map<string, CurrentInput>()
  for (let i = 0; i < canonicalIds.length; i += ID_BATCH) {
    const { data, error } = await db
      .from('fsn_canonical')
      .select('id, content_hash, attachment_digest, revision_count, last_seen_at')
      .in('id', canonicalIds.slice(i, i + ID_BATCH))
    if (error) throw new Error(`input currency: canonical records unavailable (${error.code ?? 'unknown'})`)
    for (const row of data ?? []) current.set(row.id, row)
  }

  return assessInputCurrency(screened, current)
}
