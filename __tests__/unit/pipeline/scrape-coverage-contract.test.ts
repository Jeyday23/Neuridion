import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineContext } from '@/lib/pipeline/types'
import type { ScraperResult, ScrapedFsn } from '@/lib/scrapers/bfarm'

const mergeCoverage = vi.fn(async () => undefined)
const getCoveredRanges = vi.fn(async () => [] as Array<{ from: string; to: string }>)
const computeUncoveredRanges = vi.fn((covered: Array<{ from: string; to: string }>, from: string, to: string) => (
  covered.some(range => range.from <= from && range.to >= to) ? [] : [{ from, to }]
))
const getCanonicalItems = vi.fn(async () => [] as ScrapedFsn[])
const scraper = vi.fn(async () => nextResult)
const upsertCanonical = vi.fn(async (items: ScrapedFsn[]) => items.map(item => ({
  canonical_id: `canonical-${item.external_id}`,
  content_changed: false,
})))
let nextResult: ScraperResult

vi.mock('@/lib/scrapers/registry', () => ({
  getProductionScraper: () => scraper,
}))

vi.mock('@/lib/sync/coverage', () => ({
  getCoveredRanges,
  computeUncoveredRanges,
  mergeCoverage,
  overlapWindowStart: vi.fn(() => '2026-06-01'),
}))

vi.mock('@/lib/sync/canonical', () => ({
  upsertCanonical,
  getCanonicalItems,
}))

vi.mock('@/lib/pipeline/stages/insert-results', () => ({
  insertResultsStage: vi.fn(async (ctx: PipelineContext) => {
    ctx.insertedRows.push(...ctx.items.map(item => ({ ...item, id: item.external_id, run_id: ctx.runId })))
  }),
}))

const item: ScrapedFsn = {
  external_id: 'record-1',
  title: 'Safety notice',
  manufacturer: null,
  product_name: null,
  fsn_date: '2026-06-01',
  source_url: 'https://example.test/record-1',
  raw_content: 'Safety notice',
  source_db: 'fda',
}

function context(): PipelineContext {
  return {
    runId: 'run-1',
    payload: {
      profile_id: 'profile-1',
      user_id: 'user-1',
      period_from: '2026-06-01',
      period_to: '2026-06-01',
      selected_dbs: ['fda'],
      force_refresh: false,
    },
    db: {} as PipelineContext['db'],
    profile: {
      device_name: '', manufacturer: '', intended_use: null,
      emdn_code: null, device_class: null, search_strategy: null,
    },
    aiOptOut: false,
    searchTerms: [],
    competitorTerms: [],
    activeSources: ['fda'],
    items: [],
    insertedRows: [],
    decisions: [],
    warnings: [],
    contentChanged: new Set(),
    canonicalIds: new Map(),
    timing: {},
    sourceBreakdown: [],
    isCancelled: vi.fn(async () => false),
  }
}

describe('scrape coverage completeness contract', () => {
  beforeEach(() => {
    mergeCoverage.mockClear()
    upsertCanonical.mockClear()
    getCoveredRanges.mockClear()
    computeUncoveredRanges.mockClear()
    getCanonicalItems.mockClear()
    scraper.mockClear()
    getCoveredRanges.mockResolvedValue([])
    computeUncoveredRanges.mockImplementation((covered: Array<{ from: string; to: string }>, from: string, to: string) => (
      covered.some(range => range.from <= from && range.to >= to) ? [] : [{ from, to }]
    ))
    getCanonicalItems.mockResolvedValue([])
  })

  it('never certifies a partial range as covered', async () => {
    nextResult = { items: [item], warnings: ['result cap reached'], outcome: 'partial' }
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    await scrapeStage(context())

    expect(mergeCoverage).not.toHaveBeenCalled()
  })

  it('distinguishes the requested window from fresh source ranges in logs', async () => {
    nextResult = { items: [], warnings: [], outcome: 'empty' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    try {
      await scrapeStage(context())

      expect(log).toHaveBeenCalledWith(expect.stringContaining(
        '[scrape] fda fresh range 2026-06-01..2026-06-01:',
      ))
      expect(log).toHaveBeenCalledWith(expect.stringContaining(
        'source summary: requested=2026-06-01..2026-06-01',
      ))
    } finally {
      log.mockRestore()
    }
  })

  it('does not certify a profile-specific FDA range even when the result is empty', async () => {
    nextResult = { items: [], warnings: [], outcome: 'empty' }
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    await scrapeStage(context())

    expect(mergeCoverage).not.toHaveBeenCalled()
  })

  it('certifies a successfully checked empty range for source-complete scrapers', async () => {
    nextResult = { items: [], warnings: [], outcome: 'empty' }
    const ctx = context()
    ctx.payload.selected_dbs = ['swissmedic']
    ctx.activeSources = ['swissmedic']
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    await scrapeStage(ctx)

    expect(mergeCoverage).toHaveBeenCalledWith('swissmedic', { from: '2026-06-01', to: '2026-06-01' })
  })

  it('never reuses source-wide FDA coverage for a profile-specific query', async () => {
    getCoveredRanges.mockResolvedValue([{ from: '2026-01-01', to: '2026-06-01' }])
    getCanonicalItems.mockResolvedValue(Array.from({ length: 1000 }, (_, index) => ({
      ...item,
      external_id: `cached-${index}`,
    })))
    nextResult = {
      items: [{
        ...item,
        title: 'Medtronic Micra AV leadless pacemaker',
        manufacturer: 'Medtronic',
        product_name: 'Micra AV',
      }],
      warnings: [],
      outcome: 'complete',
    }
    const ctx = context()
    ctx.payload.period_from = '2026-01-01'
    ctx.payload.period_to = '2026-06-01'
    ctx.profile.manufacturer = 'Medtronic'
    ctx.profile.device_name = 'Micra AV'
    ctx.searchTerms = ['medtronic', 'micra']

    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')
    await scrapeStage(ctx)

    expect(getCoveredRanges).not.toHaveBeenCalled()
    expect(getCanonicalItems).not.toHaveBeenCalled()
    expect(scraper).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: '2026-01-01',
      toDate: '2026-06-01',
      searchTerms: expect.arrayContaining(['medtronic', 'micra']),
    }))
    expect(ctx.insertedRows.map(row => row.external_id)).toEqual(['record-1'])
  })

  it('live-refreshes short BfArM windows even when certified coverage exists', async () => {
    getCoveredRanges.mockResolvedValue([{ from: '2026-06-02', to: '2026-07-02' }])
    getCanonicalItems.mockResolvedValue(Array.from({ length: 64 }, (_, index) => ({
      ...item,
      external_id: `stale-bfarm-${index}`,
      source_db: 'bfarm',
    })))
    nextResult = {
      items: Array.from({ length: 63 }, (_, index) => ({
        ...item,
        external_id: `live-bfarm-${index}`,
        source_db: 'bfarm',
      })),
      warnings: [],
      outcome: 'complete',
    }
    const ctx = context()
    ctx.payload.selected_dbs = ['bfarm']
    ctx.activeSources = ['bfarm']
    ctx.payload.period_from = '2026-06-02'
    ctx.payload.period_to = '2026-07-02'

    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')
    await scrapeStage(ctx)

    expect(getCoveredRanges).not.toHaveBeenCalled()
    expect(computeUncoveredRanges).not.toHaveBeenCalled()
    expect(getCanonicalItems).not.toHaveBeenCalled()
    expect(scraper).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: '2026-06-02',
      toDate: '2026-07-02',
    }))
    expect(mergeCoverage).toHaveBeenCalledWith('bfarm', { from: '2026-06-02', to: '2026-07-02' })
    expect(ctx.insertedRows).toHaveLength(63)
    expect(ctx.insertedRows.map(row => row.external_id)).not.toContain('stale-bfarm-0')
    expect(ctx.sourceBreakdown).toMatchObject([{
      source: 'bfarm',
      fresh_fetched: 63,
      cached_loaded: 0,
      found_before_filtering: 63,
      status: 'complete',
      fresh_outcomes: ['2026-06-02..2026-07-02:complete'],
    }])
  })

  it('reuses certified source-wide BfArM authority coverage for longer historical windows without a live scrape', async () => {
    getCoveredRanges.mockResolvedValue([{ from: '2026-01-01', to: '2026-06-19' }])
    getCanonicalItems.mockResolvedValue(Array.from({ length: 67 }, (_, index) => ({
      ...item,
      external_id: `stale-bfarm-${index}`,
      source_db: 'bfarm',
    })))
    nextResult = { items: [], warnings: [], outcome: 'empty' }
    const ctx = context()
    ctx.payload.selected_dbs = ['bfarm']
    ctx.activeSources = ['bfarm']
    ctx.payload.period_from = '2026-01-01'
    ctx.payload.period_to = '2026-06-19'

    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')
    await scrapeStage(ctx)

    expect(getCoveredRanges).toHaveBeenCalledWith('bfarm')
    expect(computeUncoveredRanges).toHaveBeenCalledWith(
      [{ from: '2026-01-01', to: '2026-06-19' }],
      '2026-01-01',
      '2026-06-19',
    )
    expect(getCanonicalItems).toHaveBeenCalledWith('bfarm', '2026-01-01', '2026-06-19')
    expect(mergeCoverage).not.toHaveBeenCalled()
    expect(scraper).not.toHaveBeenCalled()
    expect(ctx.insertedRows).toHaveLength(67)
    expect(ctx.sourceBreakdown).toMatchObject([{
      source: 'bfarm',
      fresh_fetched: 0,
      cached_loaded: 67,
      found_before_filtering: 67,
      status: 'complete',
      fresh_outcomes: [],
    }])
  })

  it('fetches only uncovered BfArM authority gaps and merges them with cached rows', async () => {
    getCoveredRanges.mockResolvedValue([{ from: '2026-01-01', to: '2026-06-03' }])
    computeUncoveredRanges.mockReturnValue([{ from: '2026-06-04', to: '2026-06-19' }])
    getCanonicalItems.mockResolvedValue(Array.from({ length: 66 }, (_, index) => ({
      ...item,
      external_id: `cached-bfarm-${index}`,
      source_db: 'bfarm',
    })))
    nextResult = {
      items: [
        {
          ...item,
          external_id: '20020-26',
          title: 'Dringende Sicherheitsinformation zu Stella 2.0 Implantat-Orientierungsdiagramm (IOD) von STAAR Surgical AG',
          manufacturer: 'STAAR Surgical AG',
          fsn_date: '2026-06-04',
          source_db: 'bfarm',
        },
      ],
      warnings: [],
      outcome: 'complete',
    }
    const ctx = context()
    ctx.payload.selected_dbs = ['bfarm']
    ctx.activeSources = ['bfarm']
    ctx.payload.period_from = '2026-01-01'
    ctx.payload.period_to = '2026-06-19'

    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')
    await scrapeStage(ctx)

    expect(scraper).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: '2026-06-04',
      toDate: '2026-06-19',
    }))
    expect(getCanonicalItems).toHaveBeenCalledWith('bfarm', '2026-01-01', '2026-06-03')
    expect(mergeCoverage).toHaveBeenCalledWith('bfarm', { from: '2026-06-04', to: '2026-06-19' })
    expect(ctx.insertedRows).toHaveLength(67)
    expect(ctx.insertedRows.map(row => row.external_id)).toContain('20020-26')
    expect(ctx.sourceBreakdown).toMatchObject([{
      source: 'bfarm',
      fresh_fetched: 1,
      cached_loaded: 66,
      found_before_filtering: 67,
      status: 'complete',
    }])
  })

  it('does not let cached BfArM rows hide a failed freshness gap', async () => {
    getCoveredRanges.mockResolvedValue([{ from: '2025-07-01', to: '2026-06-30' }])
    computeUncoveredRanges.mockReturnValue([{ from: '2026-07-01', to: '2026-07-01' }])
    getCanonicalItems.mockResolvedValue(Array.from({ length: 263 }, (_, index) => ({
      ...item,
      external_id: `cached-bfarm-${index}`,
      source_db: 'bfarm',
    })))
    nextResult = {
      items: [],
      warnings: ['BfArM current-day live check was blocked by the authority site (HTTP 403); cached historical coverage was retained and this one-day freshness check requires retry.'],
      outcome: 'failed',
    }
    const ctx = context()
    ctx.payload.selected_dbs = ['bfarm']
    ctx.activeSources = ['bfarm']
    ctx.payload.period_from = '2025-07-01'
    ctx.payload.period_to = '2026-07-01'

    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')
    await scrapeStage(ctx)

    expect(ctx.insertedRows).toHaveLength(263)
    expect(ctx.sourceBreakdown).toMatchObject([{
      source: 'bfarm',
      fresh_fetched: 0,
      cached_loaded: 263,
      found_before_filtering: 263,
      status: 'failed',
      warnings: 1,
      fresh_outcomes: ['2026-07-01..2026-07-01:failed'],
    }])
    expect(mergeCoverage).not.toHaveBeenCalledWith('bfarm', { from: '2026-07-01', to: '2026-07-01' })
  })

  it('preserves all raw deduped source results before AI filtering and records keyword signal counts', async () => {
    nextResult = {
      items: [
        {
          ...item,
          external_id: 'raw-keyword-match',
          title: 'Medtronic Micra AV leadless pacemaker notice',
          manufacturer: 'Medtronic',
          product_name: 'Micra AV',
          raw_content: 'Micra AV field safety notice',
        },
        {
          ...item,
          external_id: 'raw-no-keyword-signal',
          title: 'Unrelated safety notice',
          manufacturer: 'Other Manufacturer',
          product_name: 'Other Device',
          raw_content: 'Unrelated source record in the same period',
        },
      ],
      warnings: [],
      outcome: 'complete',
    }
    const ctx = context()
    ctx.profile.manufacturer = 'Medtronic'
    ctx.profile.device_name = 'Micra AV'
    ctx.searchTerms = ['medtronic', 'micra']

    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')
    await scrapeStage(ctx)

    expect(ctx.insertedRows.map(row => row.external_id)).toEqual([
      'raw-keyword-match',
      'raw-no-keyword-signal',
    ])
    expect(ctx.sourceBreakdown).toMatchObject([{
      source: 'fda',
      found_before_filtering: 2,
      after_keyword_signal: 1,
      rejected_by_keyword_signal: 1,
      status: 'complete',
    }])
  })
})
