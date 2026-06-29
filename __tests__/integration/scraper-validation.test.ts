import { describe, it, expect, beforeAll } from 'vitest'

const RUN_LIVE_SCRAPER_TESTS = process.env.RUN_LIVE_SCRAPER_TESTS === 'true'
const describeLive = RUN_LIVE_SCRAPER_TESTS ? describe : describe.skip
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

describeLive('BfArM live validation', () => {
  it('returns items for a 90-day window with correct fields', async () => {
    const result = await scrapeBfArM({ fromDate: d90, toDate: now, captureRawEvidence: true })
    console.log(`[BfArM] Items: ${result.items.length} | Warnings: ${result.warnings.length}`)
    for (const item of result.items.slice(0, 5)) {
      console.log(`  ${item.fsn_date} | ${item.title.slice(0, 80)}`)
    }
    const nonStandard = result.items.filter(i => !i.title.startsWith('Dringende Sicherheitsinformation'))
    console.log(`[BfArM] Non-standard titles: ${nonStandard.length}`)
    for (const item of nonStandard.slice(0, 3)) {
      console.log(`  NEW: ${item.title.slice(0, 80)}`)
    }
    // A successful HTTP response with zero parsed rows can indicate selector
    // drift, so this live canary must prove that real notices were extracted.
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.rawArtifacts?.length).toBeGreaterThan(0)
    expect(result.rawArtifacts?.every(artifact =>
      artifact.httpStatus === 200
      && artifact.mediaType === 'text/html'
      && artifact.bytes.byteLength > 0
    )).toBe(true)
    for (const item of result.items) {
      expect(item.external_id).toBeTruthy()
      expect(item.source_db).toBe('bfarm')
      expect(item.source_url).toContain('bfarm.de')
    }
  }, 120_000)
})

describeLive('FDA MAUDE live validation', () => {
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

  it('matches the direct API unique records within the interactive cap', async () => {
    const from8 = fdaFrom.replace(/-/g, '').slice(0, 8)
    const to7   = '20241007'
    const apiKey = process.env.OPENFDA_API_KEY
    const apiUrl = `https://api.fda.gov/device/event.json?search=date_received:[${from8}+TO+${to7}]&limit=500${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`
    const apiRes = await fetch(apiUrl).then(r => r.json()).catch(() => null) as {
      meta?: { results?: { total?: number } }
      results?: Array<{ report_number?: string; mdr_report_key?: string }>
    } | null
    const apiTotal = apiRes?.meta?.results?.total ?? 0
    const uniqueApiIds = new Set((apiRes?.results ?? []).map(record =>
      record.report_number || (record.mdr_report_key ? `maude-${record.mdr_report_key}` : ''),
    ).filter(Boolean))
    console.log(`[FDA] Direct API total (${fdaFrom}–2024-10-07): ${apiTotal}`)

    const result = await scrapeFdaMaude({ fromDate: fdaFrom, toDate: '2024-10-07' })
    console.log(`[FDA] Scraper total (${fdaFrom}–2024-10-07): ${result.items.length}`)
    const scraperIds = new Set(result.items.map(item => item.external_id))
    const missing = [...uniqueApiIds].filter(id => !scraperIds.has(id))
    const captureRate = uniqueApiIds.size > 0 ? ((uniqueApiIds.size - missing.length) / uniqueApiIds.size * 100).toFixed(1) : 'N/A'
    console.log(`[FDA] Unique-record capture rate for direct API sample: ${captureRate}%`)
    console.log(`[FDA] Identity mismatch against direct sample: missing=${missing.length}; additional=${Math.max(scraperIds.size - uniqueApiIds.size, 0)}`)

    expect(missing).toEqual([])
    expect(scraperIds.size).toBeGreaterThanOrEqual(uniqueApiIds.size)
    expect(result.outcome).toBe('complete')
  }, 120_000)

  it('reports recent-window completeness explicitly', async () => {
    const result = await scrapeFdaMaude({ fromDate: fmt(d30), toDate: fmt(now) })
    console.log(`[FDA] Recent 30d: ${result.items.length} items | outcome=${result.outcome}`)
    expect(result.items.length).toBeGreaterThanOrEqual(0)
    if (result.warnings.length > 0) expect(result.outcome).toBe('partial')
    else expect(['complete', 'empty']).toContain(result.outcome)
  }, 30_000)
})

describeLive('MHRA live validation', () => {
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

  it('covers direct device listings and roundup references returned by GOV.UK', async () => {
    const d14 = new Date(now); d14.setDate(d14.getDate() - 14)
    const from = fmt(d14)
    const expectedUrls = new Set<string>()
    const roundupPaths = new Set<string>()
    let start = 0

    while (true) {
      const url = new URL('https://www.gov.uk/api/search.json')
      url.searchParams.set('filter_format', 'medical_safety_alert')
      url.searchParams.set('count', '100')
      url.searchParams.set('start', String(start))
      url.searchParams.set('order', '-public_timestamp')
      for (const field of ['title', 'link', 'public_timestamp', 'alert_type']) url.searchParams.append('fields[]', field)
      const page = await fetch(url).then(r => r.json()) as {
        results?: Array<{ title?: string; link?: string; public_timestamp?: string; alert_type?: string[] }>
        total?: number
      }
      const rows = page.results ?? []
      let reachedBoundary = false
      for (const row of rows) {
        const date = row.public_timestamp?.slice(0, 10)
        if (date && date < from) { reachedBoundary = true; continue }
        if (!date || date > fmt(now)) continue
        const isDevice = (row.alert_type ?? []).some(type => type === 'field-safety-notices' || type === 'device-safety-information')
        const isRoundup = /field safety notices/i.test(row.title ?? '')
        if (isDevice && isRoundup && row.link) roundupPaths.add(row.link)
        if (isDevice && !isRoundup && row.link) expectedUrls.add(`https://www.gov.uk${row.link}`)
      }
      start += rows.length
      if (reachedBoundary || rows.length === 0 || start >= (page.total ?? 0)) break
    }

    const expectedRoundupIds = new Set<string>()
    for (const path of roundupPaths) {
      const detail = await fetch(`https://www.gov.uk/api/content${path}`).then(r => r.json()) as { details?: { body?: string } }
      const sections = (detail.details?.body ?? '').split(/<h3[^>]*>/i).slice(1)
      for (const section of sections) {
        const firstParagraphs = (section.match(/<p[^>]*>[\s\S]*?<\/p>/gi) ?? []).slice(0, 3).join(' ')
        const plainText = firstParagraphs.replace(/<[^>]+>/g, ' ')
        const dateMatch = plainText.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/)
        const formalRef = section.match(/\b20\d{2}\/\d{3}\/\d{3}\/\d{3}\/\d{3}\b/)?.[0]
        const numericRef = section.match(/MHRA reference:[\s\S]*?(\d{7,10})/i)?.[1]
        if (!dateMatch || (!formalRef && !numericRef)) continue
        const date = new Date(`${dateMatch[1]} UTC`).toISOString().slice(0, 10)
        if (date >= from && date <= fmt(now)) expectedRoundupIds.add(`mhra-ref-${formalRef ?? numericRef}`)
      }
    }

    const result = await scrapeMhra({ fromDate: from, toDate: fmt(now) })
    const actualUrls = new Set(result.items.map(item => item.source_url))
    const actualIds = new Set(result.items.map(item => item.external_id))
    const missingUrls = [...expectedUrls].filter(url => !actualUrls.has(url))
    const missingRoundupIds = [...expectedRoundupIds].filter(id => !actualIds.has(id))
    console.log(`[MHRA] Direct listings=${expectedUrls.size}; roundup references=${expectedRoundupIds.size}; missing=${missingUrls.length + missingRoundupIds.length}`)
    expect(expectedUrls.size + expectedRoundupIds.size).toBeGreaterThan(0)
    expect(result.outcome).toBe('complete')
    expect(missingUrls).toEqual([])
    expect(missingRoundupIds).toEqual([])
  }, 180_000)
})

describeLive('Swissmedic live validation', () => {
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

  it('matches every direct API identity for the requested window', async () => {
    const body = JSON.stringify({ fromDate: fmt(d30), toDate: fmt(now) })
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' }

    const expectedIds = new Set<string>()
    let pageNumber = 0
    let totalPages = 1
    do {
      const page = await fetch(`https://fsca.swissmedic.ch/mep/api/publications/search?pageNumber=${pageNumber}&sortingProperty=PUBLICATION_DATE&direction=DESC&size=100`, { method: 'POST', headers, body })
        .then(r => r.json()) as { content?: Array<{ swissmedicRef?: string; publikationsDatum?: string; statusDatum?: string }>; totalPages?: number }
      totalPages = page.totalPages ?? 1
      for (const publication of page.content ?? []) {
        const date = publication.publikationsDatum ?? publication.statusDatum
        if (publication.swissmedicRef && date && date >= fmt(d30) && date <= fmt(now)) expectedIds.add(publication.swissmedicRef.trim())
      }
      pageNumber++
    } while (pageNumber < totalPages)

    const result = await scrapeSwissmedic({ fromDate: fmt(d30), toDate: fmt(now) })
    const actualIds = new Set(result.items.map(item => item.external_id))
    const missing = [...expectedIds].filter(id => !actualIds.has(id))
    const unexpected = [...actualIds].filter(id => !expectedIds.has(id))
    console.log(`[Swissmedic] Direct identities=${expectedIds.size}; scraper=${actualIds.size}; missing=${missing.length}; unexpected=${unexpected.length}`)
    expect(result.outcome).toBe('complete')
    expect(missing).toEqual([])
    expect(unexpected).toEqual([])
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
