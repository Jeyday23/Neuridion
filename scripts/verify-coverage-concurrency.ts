/**
 * Check 6: Concurrent mergeCoverage race condition test — post-RPC fix.
 *
 * Fires 5 concurrent mergeCoverage calls simultaneously for the same source
 * with overlapping date ranges, 3 independent rounds (15 trials total).
 *
 * Expected (correct every time): zero overlapping rows, zero adjacent-but-
 * separate rows; exactly the predicted union of all input ranges.
 *
 * Run: source .env.local && npx ts-node --skip-project \
 *   --compiler-options '{"module":"commonjs","esModuleInterop":true,"baseUrl":".","paths":{"@/*":["./*"]}}' \
 *   scripts/verify-coverage-concurrency.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('tsconfig-paths').register({ baseUrl: path.resolve(__dirname, '..'), paths: { '@/*': ['./*'] } })

import { createClient } from '@supabase/supabase-js'
import { mergeCoverage, getCoveredRanges } from '../lib/sync/coverage'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!supabaseUrl || !serviceKey) { console.error('Missing env vars'); process.exit(1) }
const db = createClient(supabaseUrl, serviceKey)

const SOURCE = 'bfarm-concurrency-test'

async function cleanupSource(): Promise<void> {
  await db.from('sync_coverage').delete().eq('source', SOURCE)
}

// Five overlapping ranges — expected union: 2024-01-01 to 2024-04-30 (121 days)
const RANGES = [
  { from: '2024-01-01', to: '2024-02-15' },
  { from: '2024-02-01', to: '2024-03-10' },
  { from: '2024-02-20', to: '2024-03-31' },
  { from: '2024-03-15', to: '2024-04-20' },
  { from: '2024-04-10', to: '2024-04-30' },
]
const EXPECTED_FROM = '2024-01-01'
const EXPECTED_TO   = '2024-04-30'

async function runConcurrentRound(round: number): Promise<{
  pass: boolean
  rows: { from: string; to: string }[]
  failureReason?: string
}> {
  await cleanupSource()

  // All 5 merges fire simultaneously into the same source.
  await Promise.all(RANGES.map(r => mergeCoverage(SOURCE, r)))

  const rows = await getCoveredRanges(SOURCE)

  // Correct result: exactly 1 row covering the full union.
  if (rows.length === 1 && rows[0].from === EXPECTED_FROM && rows[0].to === EXPECTED_TO) {
    console.log(`  Round ${round}: PASS — 1 row [${rows[0].from} → ${rows[0].to}]`)
    return { pass: true, rows }
  }

  // Any other outcome is a failure.
  const totalCovered = computeTotalCoveredDays(rows)
  const expectedDays = daysBetween(EXPECTED_FROM, EXPECTED_TO) + 1

  let failureReason: string
  if (rows.length > 1) {
    failureReason = `${rows.length} rows instead of 1 (overlap or fragmentation): ${JSON.stringify(rows)}`
  } else if (rows.length === 0) {
    failureReason = `0 rows — all inserts lost`
  } else {
    failureReason = `Wrong span: got [${rows[0].from} → ${rows[0].to}], expected [${EXPECTED_FROM} → ${EXPECTED_TO}]`
  }

  console.log(`  Round ${round}: FAIL — ${failureReason}. Covered ${totalCovered}/${expectedDays} days.`)
  return { pass: false, rows, failureReason }
}

function computeTotalCoveredDays(rows: { from: string; to: string }[]): number {
  if (rows.length === 0) return 0
  const sorted = [...rows].sort((a, b) => a.from.localeCompare(b.from))
  const merged: { from: string; to: string }[] = []
  for (const r of sorted) {
    if (merged.length === 0 || r.from > nextDay(merged[merged.length - 1].to)) {
      merged.push({ ...r })
    } else {
      if (r.to > merged[merged.length - 1].to) merged[merged.length - 1].to = r.to
    }
  }
  return merged.reduce((sum, r) => sum + daysBetween(r.from, r.to) + 1, 0)
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000
}

function nextDay(d: string): string {
  const dt = new Date(d + 'T00:00:00.000Z'); dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  console.log('\n=== Check 6: Coverage Concurrency (post-RPC fix) ===')
  console.log('Locking strategy: pg_advisory_xact_lock(hashtext(source)) via merge_coverage_for_source RPC')
  console.log(`Expected result per round: 1 row [${EXPECTED_FROM} → ${EXPECTED_TO}]`)
  console.log('Running 3 rounds × 5 concurrent merges = 15 trials total\n')

  const results = []
  for (let round = 1; round <= 3; round++) {
    console.log(`Round ${round}/3:`)
    for (let trial = 1; trial <= 5; trial++) {
      results.push(await runConcurrentRound(trial))
    }
    console.log()
    await new Promise(r => setTimeout(r, 200))
  }

  await cleanupSource()

  const passes  = results.filter(r => r.pass).length
  const failures = results.filter(r => !r.pass).length

  console.log(`Results: ${passes}/15 PASS, ${failures}/15 FAIL`)

  if (failures > 0) {
    console.log('\nFix is INCOMPLETE — race still observed.')
    console.log('Failure details:')
    results.filter(r => !r.pass).forEach((r, i) => console.log(`  [${i + 1}] ${r.failureReason}`))
    process.exitCode = 1
  } else {
    console.log('\n15/15 trials PASS — race condition eliminated.')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
