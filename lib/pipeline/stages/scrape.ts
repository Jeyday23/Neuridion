import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import { getProductionScraper } from '@/lib/scrapers/registry'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems } from '@/lib/sync/canonical'
import { extractManufacturerTerms, extractDeviceTerms } from '@/lib/search/manufacturer-terms'
import { matchesKeywordSignature, matchesKeywordTerm } from '@/lib/search/keyword-match'
import { daysBetween } from '@/lib/utils/date-chunks'
import { insertResultsStage } from './insert-results'
import type { PipelineContext, ProgressUpdate, SourceResultBreakdown } from '../types'
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
// Short/default PRRC review windows must be checked live so the visible raw
// count matches the authority site instead of an older fsn_canonical snapshot.
// Longer historical windows can still use certified coverage and only fetch
// uncovered gaps to keep large backfills practical.
const SOURCE_COVERAGE_REUSE_MIN_DAYS = 46
const EVIDENCE_CAPTURE_ENABLED = process.env.REGULATORY_EVIDENCE_CAPTURE === 'true'
const EVIDENCE_CAPTURE_SOURCES = new Set(
  (process.env.REGULATORY_EVIDENCE_SOURCES ?? '').split(',').map((source) => source.trim()).filter(Boolean),
)
const SENSITIVE_EVIDENCE_APPROVED = process.env.REGULATORY_EVIDENCE_ALLOW_SENSITIVE === 'true'

function evidenceCaptureEnabledFor(source: string): boolean {
  if (!EVIDENCE_CAPTURE_ENABLED || !EVIDENCE_CAPTURE_SOURCES.has(source)) return false
  return sourceCaptureAllowed(source as SourceName, SENSITIVE_EVIDENCE_APPROVED)
}

function shouldReuseSourceCoverageForWindow(fromDate: string, toDate: string): boolean {
  return daysBetween(fromDate, toDate) >= SOURCE_COVERAGE_REUSE_MIN_DAYS
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
  const devTerms = extractDeviceTerms(profile.device_name)
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
  // Competitor terms are source-discovery hints, not product evidence. A
  // competitor-only match can help pull source pages into the acquisition set,
  // but the PRRC review candidate set must remain scoped to the monitored
  // product/manufacturer signature.
  const competitorSpecificTerms = competitorTerms.filter(term =>
    !domainTerms.some(domainTerm =>
      domainTerm.toLowerCase() === term.toLowerCase(),
    ),
  )

  if (mfrTerms.length === 0 && devTerms.length === 0 && domainTerms.length === 0) {
    counts.kept = items.length
    return { items, terms, counts }
  }

  const hasDeviceOrDomainTerms = devTerms.length > 0 || domainTerms.length > 0
  const kept: ScrapedFsn[] = []

  for (const item of items) {
    const hay = `${item.title} ${item.manufacturer ?? ''} ${item.product_name ?? ''} ${item.raw_content}`.toLowerCase()

    const mfrMatch = mfrTerms.some(term => matchesKeywordTerm(hay, term))
    // A product signature may contain a family plus a distinguishing model or
    // module token. Matching only one token made generic words such as
    // "Medication" retain unrelated products and manufacturers.
    const devMatch = matchesKeywordSignature(hay, devTerms)
    // Domain and competitor signals must respect token boundaries too. Plain
    // substring matching made near-prefix noise such as "HeartStarter" count
    // as the "HeartStart" device domain.
    const domainMatch = domainTerms.some(term => matchesKeywordTerm(hay, term))
    const competitorMatch = competitorSpecificTerms.some(term => matchesKeywordTerm(hay, term))
    if (mfrMatch) counts.manufacturerMatches++
    if (devMatch) counts.deviceMatches++
    if (domainMatch) counts.domainMatches++
    if (competitorMatch) counts.competitorMatches++

    let keep = false
    if (!hasDeviceOrDomainTerms) {
      keep = mfrMatch
    } else if (item.source_db === 'fda' && devTerms.length > 0) {
      // MAUDE can contain thousands of same-manufacturer reports in one
      // clinical domain. For a named product profile, deterministic fallback
      // must require its complete device signature; manufacturer + generic
      // domain alone is not product evidence.
      keep = devMatch
    } else if (devTerms.length > 0) {
      // Product-level PRRC searches must not retain same-manufacturer,
      // same-domain records for a different named product. Example:
      // B. Braun Spaceplus Perfusor is not Infusomat Space.
      keep = devMatch
    } else {
      keep = mfrMatch && domainMatch
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
    sourceBreakdown: SourceResultBreakdown
  }> {
    // Check cancellation before starting each source's scrape work
    if (await ctx.isCancelled()) {
      console.error(`[pipeline] run_id=${ctx.runId} scrape stage: cancellation detected before starting ${sourceId}`)
      return {
        items: [], warnings: [], contentChanged: new Set(),
        canonicalIds: new Map(), authorityRevisionIds: new Map(),
        sourceBreakdown: {
          source: sourceId,
          requested_from: period_from,
          requested_to: period_to,
          fresh_fetched: 0,
          cached_loaded: 0,
          found_before_filtering: 0,
          after_keyword_signal: 0,
          rejected_by_keyword_signal: 0,
          status: 'failed',
          fresh_outcomes: [],
          warnings: 0,
        },
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
    //
    // Source-complete FSN scrapers (BfArM, Swissmedic, MHRA) can reuse certified
    // date coverage from fsn_canonical. Uncovered ranges still fetch live, and
    // only complete/empty live ranges advance coverage.
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
        captureRawEvidence: captureEvidence && sourceId === 'bfarm',
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
          rawArtifacts: result.rawArtifacts,
        })
      }
      fetchedItemCount += result.items.length
      sourceOutcomes.push(`${range.from}..${range.to}:${result.outcome}`)
      console.error(
        `[scrape] ${sourceId} fresh range ${range.from}..${range.to}: ` +
        `outcome=${result.outcome} raw=${result.items.length} warnings=${result.warnings.length}`,
      )
      items.push(...result.items)
      warnings.push(...result.warnings)
      if (canReuseSourceCoverage && (result.outcome === 'complete' || result.outcome === 'empty')) {
        coverageEligibleRanges.push(range)
      }
    }

    const reuseSourceCoverageForWindow =
      canReuseSourceCoverage && shouldReuseSourceCoverageForWindow(period_from, period_to)

    if (forceRefresh || !reuseSourceCoverageForWindow) {
      await fetchSourceRange({ from: period_from, to: period_to })
    } else {
      const covered    = await getCoveredRanges(sourceId)
      const uncovered  = computeUncoveredRanges(covered, period_from, period_to)

      for (const range of uncovered) {
        await fetchSourceRange(range)
      }

      const coveredInWindow = covered.filter(
        (c) => c.to >= period_from && c.from <= period_to,
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
    const keywordSignaled = filterAudit.items
    const normalizedOutcome: SourceResultBreakdown['status'] =
      sourceOutcomes.some((outcome) => outcome.endsWith(':failed')) ? 'failed'
      : sourceOutcomes.some((outcome) => outcome.endsWith(':partial')) ? 'partial'
      : deduped.length === 0 ? 'empty'
      : warnings.length > 0 ? 'complete_with_fallback'
      : 'complete'
    const sourceBreakdown: SourceResultBreakdown = {
      source: sourceId,
      requested_from: period_from,
      requested_to: period_to,
      fresh_fetched: fetchedItemCount,
      cached_loaded: cachedItemCount,
      found_before_filtering: deduped.length,
      after_keyword_signal: keywordSignaled.length,
      rejected_by_keyword_signal: Math.max(0, deduped.length - keywordSignaled.length),
      status: normalizedOutcome,
      fresh_outcomes: sourceOutcomes,
      warnings: warnings.length,
    }
    console.error(
      `[scrape] ${sourceId} source summary: requested=${period_from}..${period_to} ` +
      `fetched=${fetchedItemCount} cached=${cachedItemCount} ` +
      `deduped=${deduped.length} keyword_signal=${keywordSignaled.length} warnings=${warnings.length} ` +
      `fresh_outcomes=${sourceOutcomes.join(',') || 'cache-only'}`,
    )
    if (keywordSignaled.length < deduped.length) {
      console.error(`[scrape] ${sourceId} keyword signal: ${keywordSignaled.length}/${deduped.length} raw items matched product terms; all raw items continue to AI review`)
    }
    console.error(`[scrape] ${sourceId} keyword audit: ${JSON.stringify({
      terms: filterAudit.terms,
      counts: filterAudit.counts,
    })}`)

    if (!progressState.sources_done.includes(sourceId)) progressState.sources_done.push(sourceId)
    const remaining = activeSources.filter(s => !progressState.sources_done.includes(s))
    progressState.items_found   += deduped.length
    progressState.current_source = remaining[0] ?? null
    progressState.source_breakdown = [...(progressState.source_breakdown ?? []), sourceBreakdown]
    if (ctx.onProgress) await ctx.onProgress({
      ...progressState,
      sources_done: [...progressState.sources_done],
      source_breakdown: [...(progressState.source_breakdown ?? [])],
    })

    return {
      items: deduped,
      warnings,
      contentChanged,
      canonicalIds,
      authorityRevisionIds,
      sourceBreakdown,
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
        `[pipeline] ${activeSources[i]} completed: raw=${r.value.items.length} warnings=${r.value.warnings.length}`,
      )
      ctx.sourceBreakdown.push(r.value.sourceBreakdown)
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
      ctx.sourceBreakdown.push({
        source: activeSources[i],
        requested_from: period_from,
        requested_to: period_to,
        fresh_fetched: 0,
        cached_loaded: 0,
        found_before_filtering: 0,
        after_keyword_signal: 0,
        rejected_by_keyword_signal: 0,
        status: 'failed',
        fresh_outcomes: [],
        warnings: 1,
      })
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
