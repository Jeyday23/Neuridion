import {
  scraperResult,
  scrapeRssFeed,
  type ScrapedFsn,
  type ScraperResult,
} from './bfarm'

const FRESHNESS_ONLY_WARNING = 'BfArM RSS is a freshness supplement, not a complete date-range source'

export async function fetchBfarmRss(params: {
  fromDate: string
  toDate: string
  signal?: AbortSignal
}): Promise<ScraperResult> {
  try {
    const from = new Date(`${params.fromDate}T00:00:00.000Z`)
    const to = new Date(`${params.toDate}T23:59:59.999Z`)
    const items = await scrapeRssFeed({ fromDate: from, toDate: to, signal: params.signal })
    const seen = new Set<string>()
    const deduped = items.filter((item) => {
      if (!item.fsn_date || item.fsn_date < params.fromDate || item.fsn_date > params.toDate) return false
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })

    return scraperResult(deduped, [FRESHNESS_ONLY_WARNING], { archiveLimitationHit: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return scraperResult([], [`BfArM RSS cross-check unavailable: ${message}`], { failed: true })
  }
}

export function detectBfarmOutage(primary: ScraperResult, rss: ScraperResult): boolean {
  return primary.items.length === 0 && rss.outcome !== 'failed' && rss.items.length > 0
}

function unionByExternalId(groups: ScrapedFsn[][]): ScrapedFsn[] {
  const merged: ScrapedFsn[] = []
  const keyToIndex = new Map<string, number>()
  for (const group of groups) {
    for (const item of group) {
      const keys = [`id:${item.external_id}`, `url:${normalizeUrl(item.source_url)}`]
      const existingIndex = keys
        .map((key) => keyToIndex.get(key))
        .find((index): index is number => index !== undefined)
      if (existingIndex !== undefined) {
        keys.forEach((key) => keyToIndex.set(key, existingIndex))
        continue
      }
      const index = merged.push(item) - 1
      keys.forEach((key) => keyToIndex.set(key, index))
    }
  }
  return merged
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}

/**
 * Adds recent RSS evidence without allowing the bounded feed to certify primary
 * portal coverage. The primary outcome remains authoritative unless RSS proves
 * that an empty/failed primary missed current records.
 */
export function mergeBfarmFreshness(primary: ScraperResult, rss: ScraperResult): ScraperResult {
  const outageSuspected = detectBfarmOutage(primary, rss)
  const items = unionByExternalId([primary.items, rss.items])
  const operationalRssWarnings = rss.outcome === 'failed' ? rss.warnings : []
  const warnings = [...new Set([
    ...primary.warnings,
    ...operationalRssWarnings,
    ...(outageSuspected
      ? ['BfArM portal outage suspected: primary returned no records while RSS has recent records']
      : []),
  ])]

  const outcome = outageSuspected
    ? 'partial'
    : primary.outcome

  return {
    items,
    warnings,
    outcome,
    ...(primary.archiveLimitationHit !== undefined
      ? { archiveLimitationHit: primary.archiveLimitationHit }
      : {}),
    diagnostics: {
      ...primary.diagnostics,
      channelItemCounts: {
        ...(primary.diagnostics?.channelItemCounts ?? {}),
        'HTML primary': primary.items.length,
        'RSS freshness': rss.items.length,
      },
      bfarmRssOutcome: rss.outcome,
      bfarmOutageSuspected: outageSuspected,
    },
  }
}
