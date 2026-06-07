import { scrapeBfarm, type ScrapedFsn, type ScraperResult, type ScraperParams } from '@/lib/scrapers/bfarm'
import { scrapeMhra }       from '@/lib/scrapers/mhra'
import { scrapeMhraExcel }  from '@/lib/scrapers/mhra-excel'
import { scrapeFdaMaude }   from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems } from '@/lib/sync/canonical'
import { extractManufacturerTerms, buildManufacturerSearchTerms } from '@/lib/search/manufacturer-terms'
import { insertResultsStage } from './insert-results'
import type { PipelineContext, ProgressUpdate } from '../types'

const SOURCE_TIMEOUTS_MS: Record<string, number> = {
  bfarm:      180_000,
  fda:        90_000,
  mhra:       120_000,
  swissmedic: 60_000,
}

const DEFAULT_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function scrapeMhraWithFallback(params: ScraperParams): Promise<ScraperResult> {
  try {
    return await scrapeMhraExcel(params)
  } catch (err) {
    try {
      const fallback = await scrapeMhra(params)
      fallback.warnings.push(
        `MHRA Excel scraper failed (${err instanceof Error ? err.message : String(err)}) — results via HTML fallback`,
      )
      return fallback
    } catch (fallbackErr) {
      return {
        items: [],
        warnings: [
          `MHRA Excel scraper failed: ${err instanceof Error ? err.message : String(err)}`,
          `MHRA HTML fallback also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        ],
      }
    }
  }
}

const SCRAPERS: Record<string, (p: ScraperParams) => Promise<ScraperResult>> = {
  bfarm:      scrapeBfarm,
  mhra:       scrapeMhraWithFallback,
  fda:        scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function buildSourceSearchTerms(
  sourceId: string,
  searchTerms: string[],
  competitorTerms: string[],
): string[] {
  return sourceId === 'fda'
    ? [...new Set(searchTerms)]
    : [...new Set([...searchTerms, ...competitorTerms])]
}

const DOMAIN_TERMS: Array<{ match: RegExp; terms: string[] }> = [
  {
    match: /micra|pacemaker|leadless|cardiac|crt|icd|defib/i,
    terms: ['micra', 'pacemaker', 'leadless', 'cardiac', 'crt', 'icd', 'defibrillator'],
  },
  {
    match: /infusomat|infusion|pump|perfusor|syringe/i,
    terms: ['infusomat', 'infusion', 'pump', 'perfusor', 'syringe'],
  },
  {
    match: /magnetom|mri|mr\b|magnetic resonance/i,
    terms: ['magnetom', 'mri', 'magnetic', 'resonance'],
  },
  {
    match: /heartstart|aed|defibrillator/i,
    terms: ['heartstart', 'aed', 'defibrillator'],
  },
  {
    match: /accu-chek|glucose|diabetes|blood glucose/i,
    terms: ['accu-chek', 'glucose', 'diabetes'],
  },
  {
    match: /da vinci|robot|robotic/i,
    terms: ['vinci', 'robot', 'robotic'],
  },
]

function buildDomainTerms(profile: { device_name: string }): string[] {
  const seed = profile.device_name ?? ''
  return [...new Set(
    DOMAIN_TERMS
      .filter(d => d.match.test(seed))
      .flatMap(d => d.terms),
  )]
}

function includesAny(hay: string, terms: string[]): boolean {
  return terms.some(t => hay.includes(t.toLowerCase()))
}

export function filterByKeywordRelevance(
  items: ScrapedFsn[],
  profile: { manufacturer: string; device_name: string },
  competitorTerms: string[],
): ScrapedFsn[] {
  const mfrTerms = extractManufacturerTerms(profile.manufacturer)
  const allTerms = buildManufacturerSearchTerms(profile.manufacturer, profile.device_name)
  const devTerms = allTerms.filter(t => !mfrTerms.includes(t))
  const domainTerms = buildDomainTerms(profile)

  if (mfrTerms.length === 0 && devTerms.length === 0 && domainTerms.length === 0) {
    return items
  }

  const hasDeviceOrDomainTerms = devTerms.length > 0 || domainTerms.length > 0

  return items.filter(item => {
    const hay = `${item.title} ${item.manufacturer ?? ''} ${item.product_name ?? ''} ${item.raw_content}`.toLowerCase()

    const mfrMatch = includesAny(hay, mfrTerms)
    const devMatch = includesAny(hay, devTerms)
    const domainMatch = includesAny(hay, domainTerms)
    const competitorMatch = includesAny(hay, competitorTerms)

    if (!hasDeviceOrDomainTerms) {
      return mfrMatch
    }

    if (mfrMatch && devMatch) return true
    if (mfrMatch && domainMatch) return true
    if (devMatch) return true
    if (domainMatch && competitorMatch) return true

    return false
  })
}

export async function scrapeStage(ctx: PipelineContext): Promise<void> {
  const { payload, profile, searchTerms, competitorTerms, activeSources } = ctx
  const { period_from, period_to, force_refresh: forceRefresh } = payload

  const progressState: ProgressUpdate = {
    current_source: activeSources[0] ?? null,
    sources_done:   [],
    sources_total:  activeSources,
    items_found:    0,
  }

  if (ctx.onProgress) await ctx.onProgress({ ...progressState })

  async function processSource(sourceId: string): Promise<{
    items: ScrapedFsn[]; warnings: string[]; contentChanged: Set<string>; canonicalIds: Map<string, string>
  }> {
    // Check cancellation before starting each source's scrape work
    if (await ctx.isCancelled()) {
      console.error(`[pipeline] run_id=${ctx.runId} scrape stage: cancellation detected before starting ${sourceId}`)
      return { items: [], warnings: [], contentChanged: new Set(), canonicalIds: new Map() }
    }

    const items:          ScrapedFsn[]        = []
    const warnings:       string[]            = []
    const contentChanged: Set<string>         = new Set()
    const canonicalIds:   Map<string, string> = new Map()
    const fetchedRanges:  { from: string; to: string }[] = []

    const localSearchTerms = buildSourceSearchTerms(sourceId, searchTerms, competitorTerms)

    async function fetchSourceRange(range: { from: string; to: string }): Promise<void> {
      const result = await SCRAPERS[sourceId]({
        fromDate:    range.from,
        toDate:      range.to,
        searchTerms: localSearchTerms.length > 0 ? localSearchTerms : undefined,
        profile:     {
          manufacturer: profile.manufacturer ?? '',
          device_name:  profile.device_name  ?? '',
        },
      })
      items.push(...result.items)
      warnings.push(...result.warnings)
      if (result.items.length > 0) fetchedRanges.push(range)
    }

    const overlapFrom = overlapWindowStart(period_to)

    if (forceRefresh) {
      await fetchSourceRange({ from: period_from, to: period_to })
    } else {
      const covered    = await getCoveredRanges(sourceId)
      const gapCheckTo = overlapFrom > period_from ? prevDay(overlapFrom) : period_from
      const uncovered  = computeUncoveredRanges(covered, period_from, gapCheckTo)

      for (const range of uncovered) {
        await fetchSourceRange(range)
      }

      if (overlapFrom <= period_to) {
        await fetchSourceRange({ from: overlapFrom, to: period_to })
      }

      const coveredInWindow = covered.filter(
        (c) => c.to >= period_from && c.from <= (overlapFrom > period_from ? prevDay(overlapFrom) : period_from),
      )

      for (const range of coveredInWindow) {
        const canonFrom = range.from < period_from ? period_from : range.from
        const canonTo   = range.to   > period_to   ? period_to   : range.to
        const cached    = await getCanonicalItems(sourceId, canonFrom, canonTo)
        items.push(...cached)
      }
    }

    const seen    = new Set<string>()
    const deduped = items.filter((item) => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })

    let canonicalPersisted = deduped.length === 0
    if (deduped.length > 0) {
      try {
        const results = await upsertCanonical(deduped)
        for (let i = 0; i < results.length; i++) {
          canonicalIds.set(deduped[i].external_id, results[i].canonical_id)
          if (results[i].content_changed) contentChanged.add(deduped[i].external_id)
        }
        canonicalPersisted = true
      } catch (err) {
        console.error(`[pipeline] ${sourceId}: canonical upsert failed:`, err instanceof Error ? err.message : String(err))
      }
    }

    if (canonicalPersisted && !forceRefresh) {
      await Promise.all(fetchedRanges.map((range) => mergeCoverage(sourceId, range)))
    }

    const filtered = filterByKeywordRelevance(deduped, profile, competitorTerms)
    if (filtered.length < deduped.length) {
      console.error(`[scrape] ${sourceId} keyword filter: ${deduped.length} → ${filtered.length} items`)
    }

    const keptIds = new Set(filtered.map(i => i.external_id))

    if (!progressState.sources_done.includes(sourceId)) progressState.sources_done.push(sourceId)
    const remaining = activeSources.filter(s => !progressState.sources_done.includes(s))
    progressState.items_found   += filtered.length
    progressState.current_source = remaining[0] ?? null
    if (ctx.onProgress) await ctx.onProgress({ ...progressState, sources_done: [...progressState.sources_done] })

    return {
      items: filtered,
      warnings,
      contentChanged: new Set([...contentChanged].filter(id => keptIds.has(id))),
      canonicalIds: new Map([...canonicalIds].filter(([eid]) => keptIds.has(eid))),
    }
  }

  const sourceResults = await Promise.allSettled(
    activeSources.map((id) => {
      const timeoutMs = SOURCE_TIMEOUTS_MS[id] ?? DEFAULT_TIMEOUT_MS
      return withTimeout(processSource(id), timeoutMs, id.toUpperCase())
    }),
  )

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      ctx.items = r.value.items
      r.value.contentChanged.forEach((id) => ctx.contentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => ctx.canonicalIds.set(eid, cid))
      ctx.warnings.push(...r.value.warnings)

      if (ctx.items.length > 0) {
        await insertResultsStage(ctx)
        ctx.items = []
      }
    } else {
      const sourceLabel = activeSources[i].toUpperCase()
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason instanceof Error ? r.reason.message : String(r.reason))
      ctx.warnings.push(
        `${sourceLabel} database was unavailable during this search and returned no results.`
      )
    }
  }

  const allFailed = sourceResults.every(r => r.status === 'rejected')
  if (allFailed) {
    throw new Error('All selected databases failed. No results could be retrieved.')
  }
}
