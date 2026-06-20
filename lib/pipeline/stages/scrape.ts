import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import { getProductionScraper } from '@/lib/scrapers/registry'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems } from '@/lib/sync/canonical'
import { extractManufacturerTerms, buildManufacturerSearchTerms } from '@/lib/search/manufacturer-terms'
import { insertResultsStage } from './insert-results'
import type { PipelineContext, ProgressUpdate } from '../types'
import {
  captureAdapterOutput,
  getLatestAuthorityRevisionIds,
  type FetchCapture,
} from '@/lib/evidence/store'
import { sha256Hex } from '@/lib/evidence/hash'
import type { SourceName } from '@/lib/evidence/types'
import { sourceCaptureAllowed } from '@/lib/evidence/source-authority'

const SOURCE_TIMEOUTS_MS: Record<string, number> = {
  fda:        90_000,
  mhra:       120_000,
  swissmedic: 60_000,
}

const DEFAULT_TIMEOUT_MS = 120_000
const EVIDENCE_CAPTURE_ENABLED = process.env.REGULATORY_EVIDENCE_CAPTURE === 'true'
const EVIDENCE_CAPTURE_SOURCES = new Set(
  (process.env.REGULATORY_EVIDENCE_SOURCES ?? '').split(',').map((source) => source.trim()).filter(Boolean),
)
const SENSITIVE_EVIDENCE_APPROVED = process.env.REGULATORY_EVIDENCE_ALLOW_SENSITIVE === 'true'

function evidenceCaptureEnabledFor(source: string): boolean {
  if (!EVIDENCE_CAPTURE_ENABLED || !EVIDENCE_CAPTURE_SOURCES.has(source)) return false
  return sourceCaptureAllowed(source as SourceName, SENSITIVE_EVIDENCE_APPROVED)
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController()

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort(new Error(`${label} timed out after ${ms / 1000}s`))
      reject(new Error(`${label} timed out after ${ms / 1000}s`))
    }, ms)

    run(controller.signal).then(resolve, reject).finally(() => clearTimeout(timer))
  })
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
  return auditKeywordRelevance(items, profile, competitorTerms).items
}

export interface KeywordFilterAudit {
  items: ScrapedFsn[]
  terms: {
    manufacturer: string[]
    device: string[]
    domain: string[]
    competitor: string[]
  }
  counts: {
    total: number
    kept: number
    manufacturerMatches: number
    deviceMatches: number
    domainMatches: number
    competitorMatches: number
    manufacturerOnlyRejected: number
    domainOnlyRejected: number
    noSignalRejected: number
  }
}

export function auditKeywordRelevance(
  items: ScrapedFsn[],
  profile: { manufacturer: string; device_name: string },
  competitorTerms: string[],
): KeywordFilterAudit {
  const mfrTerms = extractManufacturerTerms(profile.manufacturer)
  const allTerms = buildManufacturerSearchTerms(profile.manufacturer, profile.device_name)
  const devTerms = allTerms.filter(t => !mfrTerms.includes(t))
  const domainTerms = buildDomainTerms(profile)
  const counts = {
    total: items.length,
    kept: 0,
    manufacturerMatches: 0,
    deviceMatches: 0,
    domainMatches: 0,
    competitorMatches: 0,
    manufacturerOnlyRejected: 0,
    domainOnlyRejected: 0,
    noSignalRejected: 0,
  }
  const terms = {
    manufacturer: mfrTerms,
    device: devTerms,
    domain: domainTerms,
    competitor: competitorTerms,
  }

  if (mfrTerms.length === 0 && devTerms.length === 0 && domainTerms.length === 0) {
    counts.kept = items.length
    return { items, terms, counts }
  }

  const hasDeviceOrDomainTerms = devTerms.length > 0 || domainTerms.length > 0
  const kept: ScrapedFsn[] = []

  for (const item of items) {
    const hay = `${item.title} ${item.manufacturer ?? ''} ${item.product_name ?? ''} ${item.raw_content}`.toLowerCase()

    const mfrMatch = includesAny(hay, mfrTerms)
    const devMatch = includesAny(hay, devTerms)
    const domainMatch = includesAny(hay, domainTerms)
    const competitorMatch = includesAny(hay, competitorTerms)
    if (mfrMatch) counts.manufacturerMatches++
    if (devMatch) counts.deviceMatches++
    if (domainMatch) counts.domainMatches++
    if (competitorMatch) counts.competitorMatches++

    let keep = false
    if (!hasDeviceOrDomainTerms) {
      keep = mfrMatch
    } else {
      keep = (mfrMatch && devMatch)
        || (mfrMatch && domainMatch)
        || devMatch
        || (domainMatch && competitorMatch)
    }

    if (keep) {
      kept.push(item)
      counts.kept++
    } else if (mfrMatch && !devMatch && !domainMatch) {
      counts.manufacturerOnlyRejected++
    } else if (domainMatch && !competitorMatch && !mfrMatch) {
      counts.domainOnlyRejected++
    } else {
      counts.noSignalRejected++
    }
  }

  return { items: kept, terms, counts }
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

  async function processSource(sourceId: string, signal?: AbortSignal): Promise<{
    items: ScrapedFsn[]
    warnings: string[]
    contentChanged: Set<string>
    canonicalIds: Map<string, string>
    authorityRevisionIds: Map<string, string>
  }> {
    // Check cancellation before starting each source's scrape work
    if (await ctx.isCancelled()) {
      console.error(`[pipeline] run_id=${ctx.runId} scrape stage: cancellation detected before starting ${sourceId}`)
      return {
        items: [], warnings: [], contentChanged: new Set(),
        canonicalIds: new Map(), authorityRevisionIds: new Map(),
      }
    }

    const items:          ScrapedFsn[]        = []
    const warnings:       string[]            = []
    const contentChanged: Set<string>         = new Set()
    const canonicalIds:   Map<string, string> = new Map()
    const authorityRevisionIds: Map<string, string> = new Map()
    const pendingEvidenceCaptures: FetchCapture[] = []
    const coverageEligibleRanges: { from: string; to: string }[] = []
    const sourceOutcomes: string[]             = []
    let fetchedItemCount = 0
    let cachedItemCount  = 0
    const captureEvidence = evidenceCaptureEnabledFor(sourceId)

    const localSearchTerms = buildSourceSearchTerms(sourceId, searchTerms, competitorTerms)
    // FDA acquisition is profile-specific because search terms are pushed into
    // openFDA. sync_coverage is keyed only by source + date range, so reusing it
    // across profiles can return another device's capped dataset as "covered".
    // Keep FDA interactive searches fresh until bulk, source-complete ingestion
    // has its own independently certified coverage store.
    const canReuseSourceCoverage = sourceId !== 'fda'

    async function fetchSourceRange(range: { from: string; to: string }): Promise<void> {
      const scraper = getProductionScraper(sourceId)
      if (!scraper) throw new Error(`Unsupported scraper source: ${sourceId}`)

      const startedAt = new Date().toISOString()
      const result = await scraper({
        fromDate:    range.from,
        toDate:      range.to,
        searchTerms: localSearchTerms.length > 0 ? localSearchTerms : undefined,
        profile:     {
          manufacturer: profile.manufacturer ?? '',
          device_name:  profile.device_name  ?? '',
        },
        signal,
      })
      const completedAt = new Date().toISOString()
      if (captureEvidence) {
        const queryFingerprint = sha256Hex([...localSearchTerms].sort().join('\u0000'))
        pendingEvidenceCaptures.push({
          source: sourceId as SourceName,
          requestLocator: `adapter://${sourceId}?from=${range.from}&to=${range.to}&query_sha256=${queryFingerprint}`,
          startedAt,
          completedAt,
          outcome: result.outcome,
          warnings: result.warnings,
          items: result.items,
        })
      }
      fetchedItemCount += result.items.length
      sourceOutcomes.push(`${range.from}..${range.to}:${result.outcome}`)
      console.error(
        `[scrape] ${sourceId} range ${range.from}..${range.to}: ` +
        `outcome=${result.outcome} raw=${result.items.length} warnings=${result.warnings.length}`,
      )
      items.push(...result.items)
      warnings.push(...result.warnings)
      if (canReuseSourceCoverage && (result.outcome === 'complete' || result.outcome === 'empty')) {
        coverageEligibleRanges.push(range)
      }
    }

    const overlapFrom = overlapWindowStart(period_to)

    if (forceRefresh || !canReuseSourceCoverage) {
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
        cachedItemCount += cached.length
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
    let evidencePersisted = !captureEvidence
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

    if (canonicalPersisted && captureEvidence) {
      try {
        for (const capture of pendingEvidenceCaptures) {
          const captured = await captureAdapterOutput(capture, canonicalIds)
          captured.authorityRevisionIds.forEach((revisionId, externalId) => {
            authorityRevisionIds.set(externalId, revisionId)
          })
        }
        const latestRevisionIds = await getLatestAuthorityRevisionIds(canonicalIds)
        latestRevisionIds.forEach((revisionId, externalId) => {
          if (!authorityRevisionIds.has(externalId)) authorityRevisionIds.set(externalId, revisionId)
        })
        evidencePersisted = true
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        console.error(`[pipeline] ${sourceId}: evidence capture failed: ${detail}`)
        warnings.push(`${sourceId.toUpperCase()} evidence capture was incomplete; source coverage was not advanced.`)
      }
    }

    if (canonicalPersisted && evidencePersisted && !forceRefresh) {
      await Promise.all(coverageEligibleRanges.map((range) => mergeCoverage(sourceId, range)))
    }

    const filterAudit = auditKeywordRelevance(deduped, profile, competitorTerms)
    const filtered = filterAudit.items
    console.error(
      `[scrape] ${sourceId} source summary: fetched=${fetchedItemCount} cached=${cachedItemCount} ` +
      `deduped=${deduped.length} kept=${filtered.length} warnings=${warnings.length} ` +
      `outcomes=${sourceOutcomes.join(',') || 'cache-only'}`,
    )
    if (filtered.length < deduped.length) {
      console.error(`[scrape] ${sourceId} keyword filter: ${deduped.length} → ${filtered.length} items`)
    }
    console.error(`[scrape] ${sourceId} keyword audit: ${JSON.stringify({
      terms: filterAudit.terms,
      counts: filterAudit.counts,
    })}`)

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
      authorityRevisionIds: new Map([...authorityRevisionIds].filter(([eid]) => keptIds.has(eid))),
    }
  }

  const sourceResults = await Promise.allSettled(
    activeSources.map((id) => {
      if (id === 'bfarm') {
        return processSource(id)
      }
      const timeoutMs = SOURCE_TIMEOUTS_MS[id] ?? DEFAULT_TIMEOUT_MS
      return withTimeout(signal => processSource(id, signal), timeoutMs, id.toUpperCase())
    }),
  )

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      console.error(
        `[pipeline] ${activeSources[i]} completed: kept=${r.value.items.length} warnings=${r.value.warnings.length}`,
      )
      ctx.items = r.value.items
      r.value.contentChanged.forEach((id) => ctx.contentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => ctx.canonicalIds.set(eid, cid))
      r.value.authorityRevisionIds.forEach((rid, eid) => ctx.authorityRevisionIds?.set(eid, rid))
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
