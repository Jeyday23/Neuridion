import { GOLDEN_PROFILES } from './profiles'
import { runBenchmark, saveBenchmarkResults } from './runner'

function fmtRate(rate: number | null): string {
  if (rate == null) return 'N/A'
  return `${(rate * 100).toFixed(1)}%`
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--live') ? 'live' as const : 'fixture' as const
  const profileFilter = args.find((a) => a.startsWith('--profile='))?.split('=')[1]
  const compareWith = args.find((a) => a.startsWith('--compare='))?.split('=')[1]

  let profiles = GOLDEN_PROFILES
  if (profileFilter) {
    profiles = profiles.filter((p) => p.slug === profileFilter || p.slug.includes(profileFilter))
    if (profiles.length === 0) {
      console.error(`No profiles matching "${profileFilter}". Available:`)
      for (const p of GOLDEN_PROFILES) console.error(`  ${p.slug}`)
      process.exit(1)
    }
  }

  console.error(`\nNeuridion Benchmark Harness`)
  console.error(`Mode: ${mode} | Profiles: ${profiles.length}`)
  console.error(`${'─'.repeat(50)}`)

  const run = await runBenchmark(profiles, mode)
  const { jsonPath, mdPath } = saveBenchmarkResults(run)

  console.error(`\n${'═'.repeat(50)}`)
  console.error(`SUMMARY`)
  console.error(`${'═'.repeat(50)}`)
  console.error(`  Profiles tested:              ${run.profiles.length}`)
  console.error(`  Total scraped:                ${run.summary.total_scraped}`)
  console.error(`  Expected found:               ${run.summary.total_found}/${run.summary.total_expected}`)
  console.error(`  Average recall:               ${fmtRate(run.summary.avg_recall)}`)
  console.error(`  Avg keyword precision sample: ${fmtRate(run.summary.avg_precision)}`)
  console.error(`  Duration:                     ${(run.summary.duration_ms / 1000).toFixed(1)}s`)
  console.error(``)
  console.error(`  JSON: ${jsonPath}`)
  console.error(`  Report: ${mdPath}`)

  if (compareWith) {
    try {
      const { readFileSync } = await import('fs')
      const prev = JSON.parse(readFileSync(compareWith, 'utf-8')) as {
        summary: { avg_recall: number | null; avg_precision: number | null; total_scraped: number; total_found: number; total_expected: number }
      }

      console.error(`\n  COMPARISON vs ${compareWith.split('/').pop()}:`)
      const sign = (n: number) => (n > 0 ? '+' : '') + n.toFixed(1)

      if (run.summary.avg_recall != null && prev.summary.avg_recall != null) {
        const delta = run.summary.avg_recall - prev.summary.avg_recall
        console.error(`  Recall:    ${fmtRate(prev.summary.avg_recall)} → ${fmtRate(run.summary.avg_recall)} (${sign(delta * 100)}%)`)
      }
      if (run.summary.avg_precision != null && prev.summary.avg_precision != null) {
        const delta = run.summary.avg_precision - prev.summary.avg_precision
        console.error(`  Kw Prec:   ${fmtRate(prev.summary.avg_precision)} → ${fmtRate(run.summary.avg_precision)} (${sign(delta * 100)}%)`)
      }
      const scrapedDelta = run.summary.total_scraped - prev.summary.total_scraped
      const foundDelta = run.summary.total_found - prev.summary.total_found
      console.error(`  Scraped:   ${prev.summary.total_scraped} → ${run.summary.total_scraped} (${sign(scrapedDelta)})`)
      console.error(`  Found:     ${prev.summary.total_found}/${prev.summary.total_expected} → ${run.summary.total_found}/${run.summary.total_expected} (${sign(foundDelta)})`)
    } catch {
      console.error(`  Could not load comparison file: ${compareWith}`)
    }
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
