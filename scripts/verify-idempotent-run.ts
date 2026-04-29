/**
 * Integration tests for Checks 2–5: idempotent re-run, force_refresh, coverage
 * filtering, and coverage merge correctness.
 *
 * Calls lib functions directly — no HTTP auth required. Uses the dev Supabase
 * (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local).
 *
 * Run:
 *   source .env.local && npx ts-node --skip-project \
 *     --compiler-options '{"module":"commonjs","esModuleInterop":true,"paths":{}}' \
 *     scripts/verify-idempotent-run.ts
 *
 * NOTE: Requires path aliases (@/) to be resolved. Use the tsconfig-paths
 * register below, or set explicit relative imports if needed.
 */

// Register @/* path aliases so lib/ imports resolve correctly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: { '@/*': ['./*'] },
})

import { createClient } from '@supabase/supabase-js'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '../lib/sync/coverage'
import { upsertCanonical, getCanonicalItems, computeContentHash } from '../lib/sync/canonical'
import type { ScrapedFsn } from '../lib/scrapers/bfarm'

// ── Test config ───────────────────────────────────────────────────────────────

const FROM_DATE = '2025-02-01'
const TO_DATE   = '2025-02-28'
const SOURCE    = 'bfarm'

// ── Helpers ───────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.')
  process.exit(1)
}

const db = createClient(supabaseUrl, serviceKey)

async function truncateTables(): Promise<void> {
  console.log('\n[setup] Truncating fsn_canonical, sync_coverage for bfarm...')
  await db.from('fsn_canonical').delete().eq('source', SOURCE)
  await db.from('sync_coverage').delete().eq('source', SOURCE)
  const { count: canonCount } = await db.from('fsn_canonical').select('*', { count: 'exact', head: true }).eq('source', SOURCE)
  const { count: covCount }   = await db.from('sync_coverage').select('*', { count: 'exact', head: true }).eq('source', SOURCE)
  console.log(`[setup] After truncate: fsn_canonical=${canonCount}, sync_coverage=${covCount}`)
}

function makeSampleItems(count: number, baseSuffix = ''): ScrapedFsn[] {
  return Array.from({ length: count }, (_, i) => ({
    external_id:  `TEST-ITEM-${i + 1}${baseSuffix}`,
    title:        `Dringende Sicherheitsinformation — Test Device ${i + 1}${baseSuffix}`,
    manufacturer: `Test GmbH ${i + 1}`,
    product_name: `Device Model ${i + 1}`,
    fsn_date:     `2025-02-${String(i + 1).padStart(2, '0')}`,
    source_url:   `https://www.bfarm.de/test-item-${i + 1}`,
    raw_content:  `Event type: Test\n\nProduct problems: Issue ${i + 1}\n\nDescribes test issue for device ${i + 1}.`,
    source_db:    SOURCE,
  }))
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log(`  ✓ PASS: ${message}`)
  }
}

// ── Check 2: Idempotent re-run ─────────────────────────────────────────────────

async function check2(): Promise<void> {
  console.log('\n=== Check 2: Idempotent Re-run ===')
  await truncateTables()

  const items = makeSampleItems(10)

  // ── Run 1 ──────────────────────────────────────────────────────────────────
  console.log('\n[Run 1] Upserting 10 items into canonical...')
  const run1Results = await upsertCanonical(items)

  const run1New     = run1Results.filter(r => r.is_new).length
  const run1Changed = run1Results.filter(r => r.content_changed).length
  const run1Unchanged = run1Results.filter(r => !r.is_new && !r.content_changed).length

  console.log(`[Run 1] canonical: is_new=${run1New}, content_changed=${run1Changed}, unchanged=${run1Unchanged}`)
  assert(run1New === 10,     `Run 1: all 10 records should be new (got ${run1New})`)
  assert(run1Changed === 0,  `Run 1: no records should be changed on first insert (got ${run1Changed})`)
  assert(run1Unchanged === 0,`Run 1: no unchanged on first insert (got ${run1Unchanged})`)
  assert(run1Results.every(r => r.canonical_id.length === 36), 'Run 1: all canonical_ids should be UUIDs')

  await mergeCoverage(SOURCE, { from: FROM_DATE, to: TO_DATE })

  const covAfterRun1 = await getCoveredRanges(SOURCE)
  console.log(`[Run 1] Coverage after: ${JSON.stringify(covAfterRun1)}`)
  assert(covAfterRun1.length === 1, `Run 1: exactly 1 coverage row after run (got ${covAfterRun1.length})`)
  assert(covAfterRun1[0]?.from === FROM_DATE, `Run 1: coverage.from = ${FROM_DATE}`)
  assert(covAfterRun1[0]?.to   === TO_DATE,   `Run 1: coverage.to = ${TO_DATE}`)

  // ── Simulate Run 2 coverage check (fixed logic: pass ALL covered rows) ────
  console.log('\n[Run 2] Checking coverage before any source fetch...')
  const overlapFrom = overlapWindowStart(TO_DATE)
  const prevDay = (d: string) => {
    const dt = new Date(d + 'T00:00:00.000Z'); dt.setUTCDate(dt.getUTCDate() - 1)
    return dt.toISOString().slice(0, 10)
  }
  const gapCheckTo = overlapFrom > FROM_DATE ? prevDay(overlapFrom) : FROM_DATE
  // Fixed: pass all covered rows — computeUncoveredRanges clips by gapCheckTo
  const uncoveredRanges = computeUncoveredRanges(covAfterRun1, FROM_DATE, gapCheckTo)
  console.log(`[Run 2] Overlap window starts: ${overlapFrom}, gap check to: ${gapCheckTo}`)
  console.log(`[Run 2] Uncovered ranges (non-overlap): ${JSON.stringify(uncoveredRanges)}`)

  // The full range is 2025-02-01 to 2025-02-28. Overlap window = 7 days before TO_DATE = 2025-02-21.
  // So covered gaps check is for 2025-02-01 to 2025-02-20.
  // That entire sub-range IS covered → uncoveredRanges should be empty.
  assert(
    uncoveredRanges.length === 0,
    `Run 2: zero uncovered ranges outside overlap window (got ${uncoveredRanges.length}: ${JSON.stringify(uncoveredRanges)})`,
  )

  // ── Run 2: upsert same items again (simulating overlap-window re-fetch) ────
  console.log('\n[Run 2] Upserting same 10 items again (overlap window re-fetch)...')
  const run2Results = await upsertCanonical(items)

  const run2New     = run2Results.filter(r => r.is_new).length
  const run2Changed = run2Results.filter(r => r.content_changed).length
  const run2Unchanged = run2Results.filter(r => !r.is_new && !r.content_changed).length

  console.log(`[Run 2] canonical: is_new=${run2New}, content_changed=${run2Changed}, unchanged=${run2Unchanged}`)
  assert(run2New       === 0,  `Run 2: no new records (got ${run2New})`)
  assert(run2Changed   === 0,  `Run 2: no changed records when content unchanged (got ${run2Changed})`)
  assert(run2Unchanged === 10, `Run 2: all 10 records unchanged (got ${run2Unchanged})`)

  // Canonical IDs must be stable across runs
  const run1Ids = new Set(run1Results.map(r => r.canonical_id))
  const run2Ids = new Set(run2Results.map(r => r.canonical_id))
  assert(
    run1Results.every(r => run2Ids.has(r.canonical_id)),
    'Run 2: all canonical IDs identical to Run 1',
  )

  // ── Verify getCanonicalItems returns all 10 items ──────────────────────────
  const cached = await getCanonicalItems(SOURCE, FROM_DATE, TO_DATE)
  console.log(`[Run 2] getCanonicalItems returned: ${cached.length} items`)
  assert(cached.length === 10, `Run 2: getCanonicalItems returns 10 items (got ${cached.length})`)
}

// ── Check 3: force_refresh ────────────────────────────────────────────────────

async function check3(): Promise<void> {
  console.log('\n=== Check 3: force_refresh semantics ===')
  // State: canonical has 10 items, coverage is set. Simulate force_refresh run.
  console.log('[Run 3] force_refresh=true → re-upserting same 10 items (source unchanged)...')
  const items = makeSampleItems(10)

  const run3Results = await upsertCanonical(items)
  const run3New     = run3Results.filter(r => r.is_new).length
  const run3Changed = run3Results.filter(r => r.content_changed).length
  const run3Unchanged = run3Results.filter(r => !r.is_new && !r.content_changed).length

  console.log(`[Run 3] canonical: is_new=${run3New}, content_changed=${run3Changed}, unchanged=${run3Unchanged}`)
  assert(run3New       === 0,  `Run 3: no new records on force_refresh with unchanged source (got ${run3New})`)
  assert(run3Changed   === 0,  `Run 3: content_changed=0 means AI cache NOT bypassed (got ${run3Changed})`)
  assert(run3Unchanged === 10, `Run 3: all 10 records unchanged (got ${run3Unchanged})`)
}

// ── Check 3b: content actually changed ────────────────────────────────────────

async function check3b(): Promise<void> {
  console.log('\n=== Check 3b: content_changed detection ===')
  // Modify one record's raw_content and re-upsert
  const items = makeSampleItems(10)
  items[0].raw_content = 'UPDATED content — regulator revised the affected lot list.'

  const results = await upsertCanonical(items)
  const changed  = results.filter(r => r.content_changed).length
  const unchanged = results.filter(r => !r.is_new && !r.content_changed).length

  console.log(`[Check 3b] canonical: changed=${changed}, unchanged=${unchanged}`)
  assert(changed  === 1, `Check 3b: exactly 1 record flagged content_changed (got ${changed})`)
  assert(unchanged === 9, `Check 3b: 9 records unchanged (got ${unchanged})`)
  assert(results[0].content_changed === true, 'Check 3b: changed record is item[0]')
  assert(results[1].content_changed === false, 'Check 3b: item[1] not changed')

  // Restore so subsequent checks use original content
  await truncateTables()
  const restored = makeSampleItems(10)
  await upsertCanonical(restored)
  await mergeCoverage(SOURCE, { from: FROM_DATE, to: TO_DATE })
}

// ── Check 4: Coverage filtering correctness ───────────────────────────────────

async function check4(): Promise<void> {
  console.log('\n=== Check 4: Coverage filtering correctness ===')
  // Full month is in canonical. Query for first two weeks only.
  const subFrom = '2025-02-01'
  const subTo   = '2025-02-14'

  const items = await getCanonicalItems(SOURCE, subFrom, subTo)
  console.log(`[Check 4] Requested ${subFrom}→${subTo}, got ${items.length} items`)

  // Items 1-14 have fsn_date 2025-02-01 through 2025-02-14
  // Items 15-28 (but we only have 10) have fsn_date 2025-02-15+
  // With 10 items, items 1-10 have dates 2025-02-01 through 2025-02-10, all within subTo
  const allInRange = items.every(item => {
    if (!item.fsn_date) return false
    return item.fsn_date >= subFrom && item.fsn_date <= subTo
  })
  console.log('[Check 4] Items returned:', items.map(i => i.fsn_date))
  assert(allInRange, 'Check 4: all returned items fall within the narrowed two-week window')
  assert(items.length === 10, `Check 4: all 10 items fall within first two weeks (all dates ≤ 02-10) (got ${items.length})`)

  // Verify no items from second half of month leaked through
  const leaked = items.filter(i => i.fsn_date && i.fsn_date > subTo)
  assert(leaked.length === 0, `Check 4: zero items from after ${subTo} (got ${leaked.length})`)
}

// ── Check 5: Coverage merge correctness ───────────────────────────────────────

async function check5(): Promise<void> {
  console.log('\n=== Check 5: Coverage merge correctness ===')

  // After Check 4, we have one coverage row: 2025-02-01 → 2025-02-28
  const rows = await getCoveredRanges(SOURCE)
  console.log(`[Check 5] Coverage rows after checks 2-4: ${JSON.stringify(rows)}`)
  assert(rows.length === 1, `Check 5: exactly 1 coverage row after merging (got ${rows.length})`)

  // Now merge a range that extends one day before and one day after
  const extendedFrom = '2025-01-31'
  const extendedTo   = '2025-03-01'
  console.log(`[Check 5] Merging extended range ${extendedFrom}→${extendedTo}...`)
  await mergeCoverage(SOURCE, { from: extendedFrom, to: extendedTo })

  const rowsAfter = await getCoveredRanges(SOURCE)
  console.log(`[Check 5] Coverage rows after merge: ${JSON.stringify(rowsAfter)}`)
  assert(rowsAfter.length === 1, `Check 5: still 1 row after merging adjacent range (got ${rowsAfter.length})`)
  assert(rowsAfter[0]?.from === extendedFrom, `Check 5: merged from=${extendedFrom} (got ${rowsAfter[0]?.from})`)
  assert(rowsAfter[0]?.to   === extendedTo,   `Check 5: merged to=${extendedTo} (got ${rowsAfter[0]?.to})`)

  // Now insert two non-overlapping rows and verify they don't get merged
  await db.from('sync_coverage').delete().eq('source', SOURCE)
  await mergeCoverage(SOURCE, { from: '2024-01-01', to: '2024-06-30' })
  await mergeCoverage(SOURCE, { from: '2024-08-01', to: '2024-12-31' })

  const gapRows = await getCoveredRanges(SOURCE)
  console.log(`[Check 5] Two non-adjacent rows: ${JSON.stringify(gapRows)}`)
  assert(gapRows.length === 2, `Check 5: 2 non-adjacent rows stay separate (got ${gapRows.length})`)

  // Now merge a range that bridges the gap
  await mergeCoverage(SOURCE, { from: '2024-06-30', to: '2024-08-02' })
  const bridged = await getCoveredRanges(SOURCE)
  console.log(`[Check 5] After bridging gap: ${JSON.stringify(bridged)}`)
  assert(bridged.length === 1, `Check 5: bridging gap produces 1 merged row (got ${bridged.length})`)
  assert(bridged[0]?.from === '2024-01-01', `Check 5: merged from=2024-01-01 (got ${bridged[0]?.from})`)
  assert(bridged[0]?.to   === '2024-12-31', `Check 5: merged to=2024-12-31 (got ${bridged[0]?.to})`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await check2()
    await check3()
    await check3b()
    await check4()
    await check5()

    console.log()
    if (process.exitCode === 1) {
      console.log('=== RESULT: FAILURES DETECTED — see above ===')
    } else {
      console.log('=== RESULT: ALL CHECKS PASSED ===')
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exit(1)
  } finally {
    // Clean up test data
    await db.from('fsn_canonical').delete().eq('source', SOURCE).like('source_record_id', 'TEST-ITEM-%')
    await db.from('sync_coverage').delete().eq('source', SOURCE)
    console.log('[cleanup] Test data removed.')
  }
}

main()
