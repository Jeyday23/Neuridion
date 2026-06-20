import { scrapeBfarm, scraperResult, type ScrapedFsn, type ScraperParams, type ScraperResult } from './bfarm'
import { scrapeFdaMaude } from './fda-maude'
import { scrapeMhraExcel } from './mhra-excel'
import { scrapeMhra } from './mhra'
import { scrapeSwissmedic } from './swissmedic'

export type ProductionSourceId = 'bfarm' | 'mhra' | 'fda' | 'swissmedic'
export type ProductionScraper = (params: ScraperParams) => Promise<ScraperResult>

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function extractMhraReference(item: ScrapedFsn): string | null {
  const match = item.raw_content.match(/(?:^|[\s.;])(?:MHRA\s+reference|Reference):\s*([A-Za-z0-9][A-Za-z0-9./-]*)/i)
  return match?.[1] ? normalizeIdentity(match[1]) : null
}

function normalizeEvidenceUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    url.hash = ''
    url.search = ''
    if (/^(?:www\.)?gov\.uk$/i.test(url.hostname) && /^\/drug-device-alerts(?:\/|$)/i.test(url.pathname)) {
      return null
    }
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return null
  }
}

function mhraIdentityKeys(item: ScrapedFsn): string[] {
  const reference = extractMhraReference(item)
  const evidenceUrl = normalizeEvidenceUrl(item.source_url)
  return [
    reference ? `ref:${reference}` : '',
    evidenceUrl ? `url:${evidenceUrl}` : '',
    `external:${normalizeIdentity(item.external_id)}`,
  ].filter(Boolean)
}

function mergeDuplicate(primary: ScrapedFsn, secondary: ScrapedFsn): ScrapedFsn {
  const rawParts = [...new Set([primary.raw_content, secondary.raw_content].filter(Boolean))]
  const sourceUrls = [...new Set([primary.source_url, secondary.source_url].filter(Boolean))]
  return {
    ...primary,
    title: primary.title.length >= secondary.title.length ? primary.title : secondary.title,
    manufacturer: primary.manufacturer ?? secondary.manufacturer,
    product_name: primary.product_name ?? secondary.product_name,
    fsn_date: primary.fsn_date ?? secondary.fsn_date,
    raw_content: [
      ...rawParts,
      sourceUrls.length > 1 ? `MHRA evidence sources:\n${sourceUrls.join('\n')}` : '',
    ].filter(Boolean).join('\n\n'),
  }
}

export function mergeMhraEvidence(groups: ScrapedFsn[][]): ScrapedFsn[] {
  const merged: ScrapedFsn[] = []
  const keyToIndex = new Map<string, number>()

  for (const items of groups) {
    for (const item of items) {
      const keys = mhraIdentityKeys(item)
      const existingIndex = keys
        .map(key => keyToIndex.get(key))
        .find((index): index is number => index !== undefined)

      if (existingIndex === undefined) {
        const index = merged.push(item) - 1
        keys.forEach(key => keyToIndex.set(key, index))
      } else {
        merged[existingIndex] = mergeDuplicate(merged[existingIndex], item)
        keys.forEach(key => keyToIndex.set(key, existingIndex))
        mhraIdentityKeys(merged[existingIndex]).forEach(key => keyToIndex.set(key, existingIndex))
      }
    }
  }

  return merged
}

/**
 * Excel and GOV.UK are independent official views of MHRA notices. Run both:
 * fallback-only behavior cannot detect a successful but stale/incomplete feed.
 */
export async function scrapeMhraProduction(params: ScraperParams): Promise<ScraperResult> {
  const settled = await Promise.allSettled([
    scrapeMhraExcel(params),
    scrapeMhra(params),
  ])
  const labels = ['Excel', 'GOV.UK API'] as const
  const successful: Array<{ label: typeof labels[number]; result: ScraperResult }> = []
  const warnings: string[] = []

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      warnings.push(...result.value.warnings)
      if (result.value.outcome === 'failed') {
        warnings.push(`MHRA ${labels[index]} source reported a failed outcome`)
      } else {
        successful.push({ label: labels[index], result: result.value })
      }
    } else {
      warnings.push(`MHRA ${labels[index]} source failed: ${message(result.reason)}`)
    }
  })

  if (successful.length === 0) {
    return scraperResult([], warnings, { failed: true })
  }

  const items = mergeMhraEvidence(successful.map(({ result }) => result.items))
  const channelItemCounts = Object.fromEntries(
    successful.map(({ label, result }) => [label, result.items.length]),
  )
  let mhraParityDelta: number | undefined
  if (successful.length === 2) {
    const [first, second] = successful
    const unionCount = items.length
    const intersectionCount = Math.max(0, first.result.items.length + second.result.items.length - unionCount)
    mhraParityDelta = unionCount === 0 ? 0 : 1 - (intersectionCount / unionCount)
  }
  return scraperResult(items, [...new Set(warnings)], {
    diagnostics: {
      channelItemCounts,
      ...(mhraParityDelta !== undefined ? { mhraParityDelta } : {}),
    },
  })
}

export const PRODUCTION_SCRAPERS: Record<ProductionSourceId, ProductionScraper> = {
  bfarm: scrapeBfarm,
  mhra: scrapeMhraProduction,
  fda: scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

export function getProductionScraper(sourceId: string): ProductionScraper | undefined {
  return PRODUCTION_SCRAPERS[sourceId as ProductionSourceId]
}
