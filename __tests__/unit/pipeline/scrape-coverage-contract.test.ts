import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineContext } from '@/lib/pipeline/types'
import type { ScraperResult, ScrapedFsn } from '@/lib/scrapers/bfarm'

const mergeCoverage = vi.fn(async () => undefined)
const getCoveredRanges = vi.fn(async () => [] as Array<{ from: string; to: string }>)
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
  computeUncoveredRanges: vi.fn(() => []),
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
    isCancelled: vi.fn(async () => false),
  }
}

describe('scrape coverage completeness contract', () => {
  beforeEach(() => {
    mergeCoverage.mockClear()
    upsertCanonical.mockClear()
    getCoveredRanges.mockClear()
    getCanonicalItems.mockClear()
    scraper.mockClear()
    getCoveredRanges.mockResolvedValue([])
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
})
