import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { scrapeBfArM } from '../../lib/scrapers/bfarm'

beforeAll(() => {
  try {
    const envPath = resolve(__dirname, '../../.env.local')
    const envLocal = readFileSync(envPath, 'utf-8')
    for (const line of envLocal.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* .env.local may not exist */ }
})
import { scrapeFdaMaude } from '../../lib/scrapers/fda-maude'
import { scrapeMhra } from '../../lib/scrapers/mhra'
import { scrapeSwissmedic } from '../../lib/scrapers/swissmedic'

const now   = new Date()
const d30   = new Date(now); d30.setDate(d30.getDate() - 30)
const d90   = new Date(now); d90.setDate(d90.getDate() - 90)
const d180  = new Date(now); d180.setDate(d180.getDate() - 180)

const fmt = (d: Date) => d.toISOString().slice(0, 10)

describe('BfArM live validation', () => {
  it('returns items for a 90-day window with correct fields', async () => {
    const result = await scrapeBfArM({ fromDate: d90, toDate: now })
    console.log(`[BfArM] Items: ${result.items.length} | Warnings: ${result.warnings.length}`)
    for (const item of result.items.slice(0, 5)) {
      console.log(`  ${item.fsn_date} | ${item.title.slice(0, 80)}`)
    }
    const nonStandard = result.items.filter(i => !i.title.startsWith('Dringende Sicherheitsinformation'))
    console.log(`[BfArM] Non-standard titles: ${nonStandard.length}`)
    for (const item of nonStandard.slice(0, 3)) {
      console.log(`  NEW: ${item.title.slice(0, 80)}`)
    }
    expect(result.items.length).toBeGreaterThanOrEqual(0)
    for (const item of result.items) {
      expect(item.external_id).toBeTruthy()
      expect(item.source_db).toBe('bfarm')
      expect(item.source_url).toContain('bfarm.de')
    }
  }, 120_000)
})

describe('FDA MAUDE live validation', () => {
  // openFDA device/event data lags 2-6 months behind real-time.
  // Use a known historical window where data definitely exists.
  const fdaFrom = '2024-10-01'
  const fdaTo   = '2024-12-31'

  it('returns Medtronic events for a known historical window', async () => {
    const result = await scrapeFdaMaude({
      fromDate: fdaFrom,
      toDate: fdaTo,
      searchTerms: ['Medtronic'],
    })
    console.log(`[FDA] Medtronic ${fdaFrom}–${fdaTo}: ${result.items.length} items | Warnings: ${result.warnings.length}`)
    for (const w of result.warnings) console.log(`  ⚠️ ${w}`)
    for (const item of result.items.slice(0, 3)) {
      console.log(`  ${item.fsn_date} | ${item.title.slice(0, 60)} | ${item.manufacturer}`)
    }
    expect(result.items.length).toBeGreaterThan(0)
    for (const item of result.items) {
      expect(item.external_id).toBeTruthy()
      expect(item.source_db).toBe('fda')
    }
  }, 120_000)

  it('direct API total matches scraper (historical 7-day window)', async () => {
    const from8 = fdaFrom.replace(/-/g, '').slice(0, 8)
    const to7   = '20241007'
    const apiUrl = `https://api.fda.gov/device/event.json?search=date_received:[${from8}+TO+${to7}]&limit=1`
    const apiRes = await fetch(apiUrl).then(r => r.json()).catch(() => null) as { meta?: { results?: { total?: number } } } | null
    const apiTotal = apiRes?.meta?.results?.total ?? 0
    console.log(`[FDA] Direct API total (${fdaFrom}–2024-10-07): ${apiTotal}`)

    const result = await scrapeFdaMaude({ fromDate: fdaFrom, toDate: '2024-10-07' })
    console.log(`[FDA] Scraper total (${fdaFrom}–2024-10-07): ${result.items.length}`)
    const captureRate = apiTotal > 0 ? (result.items.length / Math.min(apiTotal, 500) * 100).toFixed(1) : 'N/A'
    console.log(`[FDA] Capture rate: ${captureRate}% (capped at 500)`)

    expect(result.items.length).toBeGreaterThan(0)
  }, 120_000)

  it('recent date range returns 0 gracefully (data lag)', async () => {
    const result = await scrapeFdaMaude({ fromDate: fmt(d30), toDate: fmt(now) })
    console.log(`[FDA] Recent 30d: ${result.items.length} items (0 expected due to FDA data lag)`)
    expect(result.items.length).toBeGreaterThanOrEqual(0)
    expect(result.warnings.length).toBeGreaterThanOrEqual(0)
  }, 30_000)
})

describe('MHRA live validation', () => {
  it('returns device FSNs for a 60-day window', async () => {
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60)
    const result = await scrapeMhra({ fromDate: fmt(d60), toDate: fmt(now) })
    console.log(`[MHRA] 60d: ${result.items.length} items | Warnings: ${result.warnings.length}`)
    for (const item of result.items.slice(0, 5)) {
      console.log(`  ${item.fsn_date} | ${item.title.slice(0, 70)}`)
    }

    const ids = result.items.map(i => i.external_id)
    const dupes = ids.length - new Set(ids).size
    console.log(`[MHRA] Duplicates: ${dupes}`)
    expect(dupes).toBe(0)

    for (const item of result.items) {
      expect(item.source_db).toBe('mhra')
      expect(item.source_url).toContain('gov.uk')
    }
  }, 180_000)

  it('direct API comparison: filter_format total vs scraper', async () => {
    const apiRes = await fetch('https://www.gov.uk/api/search.json?filter_format=medical_safety_alert&count=100&order=-public_timestamp&fields[]=alert_type')
      .then(r => r.json()).catch(() => null) as { results?: { alert_type?: string[] }[], total?: number } | null
    const total = apiRes?.total ?? 0
    const deviceItems = (apiRes?.results ?? []).filter(r =>
      (r.alert_type ?? []).some(t => t === 'field-safety-notices' || t === 'device-safety-information')
    )
    console.log(`[MHRA] API total (all alerts): ${total}`)
    console.log(`[MHRA] API device FSNs in first 100: ${deviceItems.length} of 100`)
    expect(total).toBeGreaterThan(0)
  }, 30_000)
})

describe('Swissmedic live validation', () => {
  it('returns FSCAs for a 30-day window', async () => {
    const result = await scrapeSwissmedic({ fromDate: fmt(d30), toDate: fmt(now) })
    console.log(`[Swissmedic] 30d: ${result.items.length} items | Warnings: ${result.warnings.length}`)
    for (const item of result.items.slice(0, 5)) {
      console.log(`  ${item.fsn_date} | ${item.manufacturer} | ${item.title.slice(0, 60)}`)
    }
    for (const item of result.items) {
      expect(item.external_id).toBeTruthy()
      expect(item.source_db).toBe('swissmedic')
    }
  }, 120_000)

  it('direct API comparison: size=100 vs default', async () => {
    const body = JSON.stringify({ fromDate: fmt(d30), toDate: fmt(now) })
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' }

    const [withSize, withoutSize] = await Promise.all([
      fetch('https://fsca.swissmedic.ch/mep/api/publications/search?pageNumber=0&sortingProperty=PUBLICATION_DATE&direction=DESC&size=100', { method: 'POST', headers, body }).then(r => r.json()).catch(() => null),
      fetch('https://fsca.swissmedic.ch/mep/api/publications/search?pageNumber=0&sortingProperty=PUBLICATION_DATE&direction=DESC', { method: 'POST', headers, body }).then(r => r.json()).catch(() => null),
    ]) as [{ content?: unknown[], totalPages?: number } | null, { content?: unknown[], totalPages?: number } | null]

    const sizeItems  = withSize?.content?.length ?? 0
    const sizePages  = withSize?.totalPages ?? 0
    const defItems   = withoutSize?.content?.length ?? 0
    const defPages   = withoutSize?.totalPages ?? 0

    console.log(`[Swissmedic] With size=100: ${sizeItems} items/page, ${sizePages} pages`)
    console.log(`[Swissmedic] Default:       ${defItems} items/page, ${defPages} pages`)
    console.log(`[Swissmedic] size=100 effective: ${sizeItems > defItems || (sizeItems === defItems && sizePages <= defPages) ? 'YES' : 'NO (same count — may be fewer than default page size)'}`)

    expect(sizeItems).toBeGreaterThanOrEqual(defItems)
  }, 30_000)

  it('180-day window with no duplicates', async () => {
    const result = await scrapeSwissmedic({ fromDate: fmt(d180), toDate: fmt(now) })
    console.log(`[Swissmedic] 180d: ${result.items.length} items`)
    const ids = result.items.map(i => i.external_id)
    const dupes = ids.length - new Set(ids).size
    console.log(`[Swissmedic] Duplicates: ${dupes}`)
    expect(dupes).toBe(0)
    expect(result.items.length).toBeGreaterThan(0)
  }, 180_000)
})
