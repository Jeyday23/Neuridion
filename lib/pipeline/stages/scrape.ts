import { scrapeBfarm, type ScrapedFsn, type ScraperResult, type ScraperParams } from '@/lib/scrapers/bfarm'
import { scrapeMhra }       from '@/lib/scrapers/mhra'
import { scrapeFdaMaude }   from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems } from '@/lib/sync/canonical'
import type { PipelineContext, ProgressUpdate } from '../types'

const SCRAPERS: Record<string, (p: ScraperParams) => Promise<ScraperResult>> = {
  bfarm:      scrapeBfarm,
  mhra:       scrapeMhra,
  fda:        scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

export function shouldBypassCoverageCache(searchTerms: string[]): boolean {
  return searchTerms.length > 0
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function scrapeStage(ctx: PipelineContext): Promise<void> {
  const { payload, profile, searchTerms, activeSources } = ctx
  const { period_from, period_to, force_refresh: forceRefresh } = payload

  const progressState: ProgressUpdate = {
    current_source: activeSources[0] ?? null,
    sources_done:   [],
    sources_total:  activeSources,
    items_found:    0,
  }

  async function processSource(sourceId: string, sourceIndex: number): Promise<{
    items: ScrapedFsn[]; warnings: string[]; contentChanged: Set<string>; canonicalIds: Map<string, string>
  }> {
    const items:          ScrapedFsn[]        = []
    const warnings:       string[]            = []
    const contentChanged: Set<string>         = new Set()
    const canonicalIds:   Map<string, string> = new Map()
    const fetchedRanges:  { from: string; to: string }[] = []

    const localSearchTerms = buildManufacturerSearchTerms(
      profile.manufacturer ?? '',
      profile.device_name  ?? '',
    )
    const hasManufacturerTerms = shouldBypassCoverageCache(localSearchTerms)

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
      if (result.warnings.length === 0 && result.items.length > 0) fetchedRanges.push(range)
    }

    const overlapFrom = overlapWindowStart(period_to)

    if (forceRefresh || hasManufacturerTerms) {
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

      const mfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
      const devTerms = localSearchTerms.filter((t) => !mfrTerms.includes(t))
      const coveredInWindow = covered.filter(
        (c) => c.to >= period_from && c.from <= (overlapFrom > period_from ? prevDay(overlapFrom) : period_from),
      )

      for (const range of coveredInWindow) {
        const canonFrom = range.from < period_from ? period_from : range.from
        const canonTo   = range.to   > period_to   ? period_to   : range.to
        const cached    = await getCanonicalItems(sourceId, canonFrom, canonTo)
        const filtered  = localSearchTerms.length === 0 ? cached : cached.filter((item) => {
          const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content ?? ''}`.toLowerCase()
          if (devTerms.length === 0) return mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const mfrMatch = mfrTerms.length === 0 || mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const devMatch = devTerms.some((t) => hay.includes(t.toLowerCase()))
          return mfrMatch && devMatch
        })
        items.push(...filtered)
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
        console.error(`[pipeline] ${sourceId}: canonical upsert failed:`, err)
      }
    }

    if (canonicalPersisted && !hasManufacturerTerms) {
      for (const range of fetchedRanges) await mergeCoverage(sourceId, range)
    }

    progressState.sources_done.push(sourceId)
    progressState.current_source = activeSources[sourceIndex + 1] ?? null
    progressState.items_found   += deduped.length
    if (ctx.onProgress) await ctx.onProgress({ ...progressState, sources_done: [...progressState.sources_done] })

    return { items: deduped, warnings, contentChanged, canonicalIds }
  }

  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => processSource(id, idx)),
  )

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      ctx.items.push(...r.value.items)
      ctx.warnings.push(...r.value.warnings)
      r.value.contentChanged.forEach((id) => ctx.contentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => ctx.canonicalIds.set(eid, cid))
    } else {
      const sourceLabel = activeSources[i].toUpperCase()
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
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
