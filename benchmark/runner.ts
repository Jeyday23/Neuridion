import { scrapeBfarm, type ScrapedFsn, type ScraperResult } from '@/lib/scrapers/bfarm'
import { scrapeMhra } from '@/lib/scrapers/mhra'
import { scrapeFdaMaude } from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { buildManufacturerSearchTerms, extractCompetitorTokens } from '@/lib/search/manufacturer-terms'
import { buildSourceSearchTerms } from '@/lib/pipeline/stages/scrape'
import { computeKeywordPriority } from '@/lib/pipeline/stages/filter'
import { matchExpected, computeRecall, measureNoiseDominance, samplePrecision } from './metrics'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { GoldenProfile, SourceResult, ProfileBenchmark, BenchmarkRun } from './types'

const SCRAPERS: Record<string, (p: { fromDate: string; toDate: string; searchTerms?: string[]; profile?: { manufacturer: string; device_name: string } }) => Promise<ScraperResult>> = {
  bfarm:      scrapeBfarm,
  mhra:       scrapeMhra,
  fda:        scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

const FIXTURES_DIR = join(__dirname, 'fixtures')
const RESULTS_DIR  = join(__dirname, 'results')

function fixtureKey(profileSlug: string, source: string): string {
  return `${profileSlug}--${source}.json`
}

function fixturePath(profileSlug: string, source: string): string {
  return join(FIXTURES_DIR, fixtureKey(profileSlug, source))
}

function loadFixture(profileSlug: string, source: string): ScrapedFsn[] | null {
  const path = fixturePath(profileSlug, source)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function saveFixture(profileSlug: string, source: string, items: ScrapedFsn[]): void {
  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true })
  writeFileSync(fixturePath(profileSlug, source), JSON.stringify(items, null, 2))
}

export class MissingFixtureError extends Error {
  constructor(profileSlug: string, source: string) {
    super(
      `Missing fixture for ${profileSlug}/${source}. ` +
      `Run: npm run benchmark:live -- --profile=${profileSlug} to generate fixtures.`,
    )
    this.name = 'MissingFixtureError'
  }
}

async function scrapeSource(
  profile: GoldenProfile,
  source: string,
  searchTerms: string[],
  competitorTerms: string[],
  mode: 'live' | 'fixture',
): Promise<SourceResult> {
  const start = Date.now()

  if (mode === 'fixture') {
    const cached = loadFixture(profile.slug, source)
    if (cached) {
      return { source, items: cached, warnings: [], duration_ms: Date.now() - start }
    }
    throw new MissingFixtureError(profile.slug, source)
  }

  const localTerms = buildSourceSearchTerms(source, searchTerms, competitorTerms)
  const scraper = SCRAPERS[source]
  if (!scraper) {
    return { source, items: [], warnings: [`Unknown source: ${source}`], duration_ms: 0 }
  }

  try {
    const result = await scraper({
      fromDate:    profile.period.from,
      toDate:      profile.period.to,
      searchTerms: localTerms.length > 0 ? localTerms : undefined,
      profile:     { manufacturer: profile.manufacturer, device_name: profile.device_name },
    })

    saveFixture(profile.slug, source, result.items)
    console.error(`  [${source}] Saved fixture: ${fixtureKey(profile.slug, source)}`)

    return { source, items: result.items, warnings: result.warnings, duration_ms: Date.now() - start }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  [${source}] Scrape failed: ${msg}`)
    return { source, items: [], warnings: [`${source} failed: ${msg}`], duration_ms: Date.now() - start }
  }
}

export async function benchmarkProfile(
  profile: GoldenProfile,
  mode: 'live' | 'fixture',
): Promise<ProfileBenchmark> {
  const start = Date.now()

  const searchTerms = buildManufacturerSearchTerms(profile.manufacturer, profile.device_name)
  const competitorTerms = extractCompetitorTokens(profile.competitor_terms)

  console.error(`\n[${profile.slug}] ${profile.device_name} / ${profile.manufacturer}`)
  console.error(`  search terms: [${searchTerms.join(', ')}]`)
  console.error(`  competitor terms: [${competitorTerms.join(', ')}]`)

  const sourceResults: SourceResult[] = []
  for (const source of profile.sources) {
    const label = mode === 'live' ? `scraping ${source} (live)...` : `loading ${source} fixture...`
    console.error(`  ${label}`)
    const result = await scrapeSource(profile, source, searchTerms, competitorTerms, mode)
    console.error(`  [${source}] ${result.items.length} items (${result.duration_ms}ms)`)
    sourceResults.push(result)
  }

  const allItems = sourceResults.flatMap((s) => s.items)

  const seen = new Set<string>()
  const deduped = allItems.filter((item) => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })

  const { extractManufacturerTerms } = await import('@/lib/search/manufacturer-terms')
  const mfrTerms = extractManufacturerTerms(profile.manufacturer)
  const ownFilterTerms = buildManufacturerSearchTerms(profile.manufacturer, profile.device_name)
  const devTerms = ownFilterTerms.filter((t) => !mfrTerms.includes(t))

  const keywordScores = new Map<string, number>()
  for (const item of deduped) {
    const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content}`.toLowerCase()
    keywordScores.set(item.external_id, computeKeywordPriority(hay, mfrTerms, devTerms, competitorTerms))
  }

  const sorted = [...deduped].sort(
    (a, b) => (keywordScores.get(a.external_id) ?? 4) - (keywordScores.get(b.external_id) ?? 4),
  )

  const matchResults = matchExpected(profile.expected.must_find, sorted)
  const recall = computeRecall(matchResults)
  const precision = samplePrecision(sorted, profile.manufacturer, profile.device_name)
  const noise = measureNoiseDominance(sorted, profile.expected.known_noise)

  const tierCounts = [0, 0, 0, 0, 0]
  for (const score of keywordScores.values()) tierCounts[score]++

  const recallDisplay = recall.rate != null ? `${(recall.rate * 100).toFixed(0)}%` : 'N/A'
  console.error(`  total: ${deduped.length} unique items`)
  console.error(`  priority: T0=${tierCounts[0]} T1=${tierCounts[1]} T2=${tierCounts[2]} T3=${tierCounts[3]} T4=${tierCounts[4]}`)
  console.error(`  recall: ${recall.found}/${recall.expected} (${recallDisplay})`)
  console.error(`  keyword precision sample: ${precision.relevant_looking}/${precision.sampled} (${(precision.rate * 100).toFixed(0)}%)`)

  return {
    profile,
    sources: sourceResults,
    total_scraped: deduped.length,
    keyword_scores: keywordScores,
    recall,
    precision_sample: precision,
    match_results: matchResults,
    noise_dominance: noise,
    duration_ms: Date.now() - start,
  }
}

export async function runBenchmark(
  profiles: GoldenProfile[],
  mode: 'live' | 'fixture' = 'fixture',
): Promise<BenchmarkRun> {
  const start = Date.now()
  const results: ProfileBenchmark[] = []

  if (mode === 'live') {
    console.error(`\n  NOTE: Live mode will save fixtures for future deterministic runs.`)
  }

  for (const profile of profiles) {
    const result = await benchmarkProfile(profile, mode)
    results.push(result)
  }

  const totalExpected = results.reduce((sum, r) => sum + r.recall.expected, 0)
  const totalFound = results.reduce((sum, r) => sum + r.recall.found, 0)
  const measurableRecall = results.filter((r) => r.recall.rate != null)
  const measurablePrecision = results.filter((r) => r.precision_sample.sampled > 0)

  const run: BenchmarkRun = {
    timestamp: new Date().toISOString(),
    mode,
    profiles: results,
    summary: {
      avg_recall: measurableRecall.length > 0
        ? measurableRecall.reduce((sum, r) => sum + (r.recall.rate ?? 0), 0) / measurableRecall.length
        : null,
      avg_precision: measurablePrecision.length > 0
        ? measurablePrecision.reduce((sum, r) => sum + r.precision_sample.rate, 0) / measurablePrecision.length
        : null,
      total_scraped: results.reduce((sum, r) => sum + r.total_scraped, 0),
      total_expected: totalExpected,
      total_found: totalFound,
      duration_ms: Date.now() - start,
    },
  }

  return run
}

export function saveBenchmarkResults(run: BenchmarkRun): { jsonPath: string; mdPath: string } {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })

  const ts = run.timestamp.replace(/[:.]/g, '-').slice(0, 19)
  const jsonPath = join(RESULTS_DIR, `benchmark-${ts}.json`)
  const mdPath   = join(RESULTS_DIR, `benchmark-${ts}.md`)

  const jsonSafe = {
    ...run,
    profiles: run.profiles.map((p) => ({
      ...p,
      keyword_scores: Object.fromEntries(p.keyword_scores),
    })),
  }
  writeFileSync(jsonPath, JSON.stringify(jsonSafe, null, 2))

  const md = generateMarkdown(run)
  writeFileSync(mdPath, md)

  return { jsonPath, mdPath }
}

function fmtRate(rate: number | null): string {
  if (rate == null) return 'N/A'
  return `${(rate * 100).toFixed(1)}%`
}

function generateMarkdown(run: BenchmarkRun): string {
  const lines: string[] = []
  const s = run.summary

  lines.push(`# Benchmark Report — ${run.timestamp.slice(0, 10)}`)
  lines.push('')
  lines.push(`Mode: **${run.mode}** | Duration: ${(s.duration_ms / 1000).toFixed(1)}s`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Average Recall | ${fmtRate(s.avg_recall)} |`)
  lines.push(`| Average Keyword Precision Sample | ${fmtRate(s.avg_precision)} |`)
  lines.push(`| Total Scraped | ${s.total_scraped} |`)
  lines.push(`| Expected Found | ${s.total_found}/${s.total_expected} |`)
  lines.push('')

  lines.push('## Per-Profile Results')
  lines.push('')
  lines.push('| Profile | Scraped | Recall | Keyword Precision Sample | Duration |')
  lines.push('|---------|---------|--------|--------------------------|----------|')
  for (const p of run.profiles) {
    const recallStr = p.recall.rate != null
      ? `${fmtRate(p.recall.rate)} (${p.recall.found}/${p.recall.expected})`
      : `N/A (${p.recall.found}/${p.recall.expected})`
    const precStr = `${fmtRate(p.precision_sample.rate)} (${p.precision_sample.relevant_looking}/${p.precision_sample.sampled})`
    lines.push(`| ${p.profile.slug} | ${p.total_scraped} | ${recallStr} | ${precStr} | ${(p.duration_ms / 1000).toFixed(1)}s |`)
  }
  lines.push('')

  for (const p of run.profiles) {
    lines.push(`### ${p.profile.slug}`)
    lines.push('')
    lines.push(`**${p.profile.device_name}** / ${p.profile.manufacturer}`)
    lines.push('')

    if (p.match_results.length > 0) {
      lines.push('Expected records:')
      for (const m of p.match_results) {
        const status = m.found ? 'FOUND' : 'MISSING'
        const desc = m.expected.description ?? m.expected.title_pattern ?? m.expected.external_id ?? '?'
        const match = m.matched_item ? ` → "${m.matched_item.title}"` : ''
        lines.push(`- [${status}] ${desc}${match}`)
      }
      lines.push('')
    }

    if (p.match_results.length === 0) {
      lines.push('*No expected records defined — recall is N/A*')
      lines.push('')
    }

    if (p.noise_dominance.length > 0) {
      lines.push('Noise dominance:')
      for (const n of p.noise_dominance.slice(0, 5)) {
        lines.push(`- "${n.term}": ${n.count} items (${n.percentage.toFixed(1)}%)`)
      }
      lines.push('')
    }

    const tierCounts = [0, 0, 0, 0, 0]
    for (const score of p.keyword_scores.values()) tierCounts[score]++
    lines.push(`Priority tiers: T0(mfr+dev)=${tierCounts[0]} T1(dev)=${tierCounts[1]} T2(mfr)=${tierCounts[2]} T3(comp)=${tierCounts[3]} T4(none)=${tierCounts[4]}`)
    lines.push('')
  }

  return lines.join('\n')
}
