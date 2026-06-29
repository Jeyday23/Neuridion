import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import { extractDeviceTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { matchesKeywordSignature, matchesKeywordTerm } from '@/lib/search/keyword-match'
import type { ExpectedRecord, MatchResult, RecallResult } from './types'

export function matchExpected(
  expected: ExpectedRecord[],
  items: ScrapedFsn[],
): MatchResult[] {
  return expected.map((exp) => {
    const matched = items.find((item) => {
      if (exp.source && item.source_db !== exp.source) return false

      if (exp.external_id && item.external_id === exp.external_id) return true

      if (exp.url && item.source_url === exp.url) return true

      if (exp.title_pattern) {
        const re = new RegExp(exp.title_pattern, 'i')
        if (re.test(item.title)) return true
        if (item.raw_content && re.test(item.raw_content)) return true
      }

      return false
    })

    return { expected: exp, found: !!matched, matched_item: matched }
  })
}

export function computeRecall(matches: MatchResult[]): RecallResult {
  if (matches.length === 0) return { found: 0, expected: 0, rate: null }
  const found = matches.filter((m) => m.found).length
  return { found, expected: matches.length, rate: found / matches.length }
}

export function measureNoiseDominance(
  items: ScrapedFsn[],
  noiseTerms: string[],
): Array<{ term: string; count: number; percentage: number }> {
  const total = items.length
  if (total === 0) return []

  return noiseTerms.map((term) => {
    const lower = term.toLowerCase()
    const count = items.filter((item) => {
      const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content}`.toLowerCase()
      return hay.includes(lower)
    }).length

    return { term, count, percentage: total > 0 ? (count / total) * 100 : 0 }
  }).filter((n) => n.count > 0)
    .sort((a, b) => b.count - a.count)
}

export function samplePrecision(
  items: ScrapedFsn[],
  profileManufacturer: string,
  profileDeviceName: string,
  sampleSize: number = 50,
): { relevant_looking: number; sampled: number; rate: number } {
  const sample = items.slice(0, sampleSize)
  if (sample.length === 0) return { relevant_looking: 0, sampled: 0, rate: 0 }

  const mfrTerms = extractManufacturerTerms(profileManufacturer)
  const devTerms = extractDeviceTerms(profileDeviceName)

  const relevantLooking = sample.filter((item) => {
    const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content}`.toLowerCase()
    const mfrMatch = mfrTerms.some(term => matchesKeywordTerm(hay, term))
    const devMatch = matchesKeywordSignature(hay, devTerms)
    return mfrMatch || devMatch
  }).length

  return { relevant_looking: relevantLooking, sampled: sample.length, rate: relevantLooking / sample.length }
}
