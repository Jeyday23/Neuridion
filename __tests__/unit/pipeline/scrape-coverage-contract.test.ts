import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineContext } from '@/lib/pipeline/types'
import type { ScraperResult, ScrapedFsn } from '@/lib/scrapers/bfarm'

const mergeCoverage = vi.fn(async () => undefined)
const upsertCanonical = vi.fn(async (items: ScrapedFsn[]) => items.map(item => ({
  canonical_id: `canonical-${item.external_id}`,
  content_changed: false,
})))
let nextResult: ScraperResult

vi.mock('@/lib/scrapers/registry', () => ({
  getProductionScraper: () => async () => nextResult,
}))

vi.mock('@/lib/sync/coverage', () => ({
  getCoveredRanges: vi.fn(async () => []),
  computeUncoveredRanges: vi.fn(() => []),
  mergeCoverage,
  overlapWindowStart: vi.fn(() => '2026-06-01'),
}))

vi.mock('@/lib/sync/canonical', () => ({
  upsertCanonical,
  getCanonicalItems: vi.fn(async () => []),
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
  })

  it('never certifies a partial range as covered', async () => {
    nextResult = { items: [item], warnings: ['result cap reached'], outcome: 'partial' }
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    await scrapeStage(context())

    expect(mergeCoverage).not.toHaveBeenCalled()
  })

  it('certifies a successfully checked empty range', async () => {
    nextResult = { items: [], warnings: [], outcome: 'empty' }
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    await scrapeStage(context())

    expect(mergeCoverage).toHaveBeenCalledWith('fda', { from: '2026-06-01', to: '2026-06-01' })
  })
})
