import { createAdminClient } from '@/lib/supabase/admin'

export interface DateRange {
  from: string  // YYYY-MM-DD
  to:   string  // YYYY-MM-DD
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCoveredRanges(source: string): Promise<DateRange[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('sync_coverage')
    .select('covered_from, covered_to')
    .eq('source', source)
    .order('covered_from', { ascending: true })

  if (error || !data) return []
  return data.map(r => ({ from: r.covered_from as string, to: r.covered_to as string }))
}

// Returns sub-ranges of [fromDate, toDate] that are NOT covered by existing coverage rows.
export function computeUncoveredRanges(
  covered: DateRange[],
  fromDate: string,
  toDate: string,
): DateRange[] {
  if (covered.length === 0) return [{ from: fromDate, to: toDate }]

  const uncovered: DateRange[] = []
  let cursor = fromDate

  for (const c of covered) {
    // Only process intervals that overlap with [cursor, toDate]
    if (c.to < cursor) continue
    if (c.from > toDate) break

    if (c.from > cursor) {
      // Gap before this covered interval
      uncovered.push({ from: cursor, to: prevDay(c.from) })
    }

    // Advance cursor past this covered interval
    cursor = nextDay(c.to)
    if (cursor > toDate) break
  }

  if (cursor <= toDate) {
    uncovered.push({ from: cursor, to: toDate })
  }

  return uncovered
}

// ─── Write ────────────────────────────────────────────────────────────────────

// Pure TypeScript merge logic, kept for unit testing only.
// NOT called on the hot path — use mergeCoverage() which delegates to the RPC.
// The RPC holds pg_advisory_xact_lock(hashtext(source)) for the duration of the
// SELECT→DELETE→INSERT, serializing concurrent merges. This TS version has no
// such guarantee and must not be used for real writes.
export function computeMergedRange(
  existing: DateRange[],
  incoming: DateRange,
): DateRange {
  const allFroms = [incoming.from, ...existing.map(r => r.from)]
  const allTos   = [incoming.to,   ...existing.map(r => r.to)]
  return {
    from: allFroms.reduce((a, b) => a < b ? a : b),
    to:   allTos.reduce((a, b) => a > b ? a : b),
  }
}

// Inserts a new coverage range and merges any adjacent/overlapping rows for the source.
// Delegates to merge_coverage_for_source RPC which holds a per-source advisory lock,
// preventing the read-modify-write race that existed in the prior TypeScript-only path.
export async function mergeCoverage(source: string, newRange: DateRange): Promise<void> {
  const db = createAdminClient()

  const { error } = await db.rpc('merge_coverage_for_source', {
    p_source:      source,
    p_range_start: newRange.from,
    p_range_end:   newRange.to,
  })

  if (error) throw error
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Returns the overlap window start (toDate minus 7 days) for incremental fetches.
export function overlapWindowStart(toDate: string): string {
  const d = new Date(toDate + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}
