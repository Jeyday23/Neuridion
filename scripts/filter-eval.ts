/**
 * Filter accuracy eval — replays the golden fixture through the REAL AI filter.
 *
 *   npm run eval:filter        (or: npx tsx scripts/filter-eval.ts)
 *
 * ⚠ Spends real Anthropic API credits (one Haiku and/or Sonnet call per case,
 *   cache bypassed). Run manually before shipping any prompt/model/pipeline
 *   change — NOT part of vitest/CI.
 *
 * Pass/fail policy (matches the product's risk profile):
 *   - expected relevant  → classified excluded   = MISSED RELEVANT → exit 1
 *   - expected excluded  → classified relevant   = false alarm     → reported only
 *   - anything → uncertain                       = flagged         → reported only
 *     (uncertain routes to PRRC manual review, so it is safe but costs attention)
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stage1Filter, type FsnContext, type ProfileContext } from '../lib/claude/filter-pipeline'

interface GoldenCase {
  name: string
  expected: 'relevant' | 'uncertain' | 'excluded'
  fsn: FsnContext
  profile: ProfileContext
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set — the eval calls the real API. Aborting.')
    process.exit(2)
  }

  const fixturePath = resolve(__dirname, '../__tests__/fixtures/filter-golden.jsonl')
  const cases: GoldenCase[] = readFileSync(fixturePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as GoldenCase)

  console.log(`Running filter eval: ${cases.length} golden cases (cache bypassed)\n`)

  let missedRelevant = 0
  let falseAlarms = 0
  let uncertainFlagged = 0
  let exact = 0
  let failed = 0

  for (const c of cases) {
    const result = await stage1Filter(c.fsn, c.profile, { skipCache: true })
    const got = result.decision

    let verdict: string
    if (got === 'filter_failed') {
      verdict = '⚠ FILTER_FAILED'
      failed++
    } else if (got === c.expected) {
      verdict = '✓'
      exact++
    } else if (c.expected === 'relevant' && got === 'excluded') {
      verdict = '✗ MISSED RELEVANT'
      missedRelevant++
    } else if (c.expected === 'excluded' && got === 'relevant') {
      verdict = '✗ false alarm'
      falseAlarms++
    } else {
      verdict = '~ uncertain-flagged'
      uncertainFlagged++
    }

    console.log(
      `${verdict.padEnd(20)} ${c.name.padEnd(28)} expected=${c.expected.padEnd(9)} ` +
      `got=${got.padEnd(13)} conf=${result.confidence ?? '—'} model=${result.model ?? '—'}`,
    )
    if (verdict.startsWith('✗') || verdict.startsWith('⚠')) {
      console.log(`    rationale: ${result.rationale.slice(0, 220)}`)
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────')
  console.log(`exact matches:      ${exact}/${cases.length}`)
  console.log(`missed relevant:    ${missedRelevant}   ← MUST be 0`)
  console.log(`false alarms:       ${falseAlarms}`)
  console.log(`uncertain-flagged:  ${uncertainFlagged} (routed to PRRC review — safe)`)
  console.log(`filter failures:    ${failed}`)

  if (missedRelevant > 0 || failed > 0) {
    console.error('\nFAIL: relevant FSNs were silently excluded or the filter errored.')
    process.exit(1)
  }
  console.log('\nPASS: no relevant FSN was silently excluded.')
}

main().catch((err) => {
  console.error('eval crashed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
