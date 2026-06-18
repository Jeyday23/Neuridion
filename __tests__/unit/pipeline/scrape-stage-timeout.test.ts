import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PipelineContext } from '@/lib/pipeline/types'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

const bfarmItem: ScrapedFsn = {
  external_id:  'bfarm-late',
  title:        'Device field safety notice',
  manufacturer: 'Acme GmbH',
  product_name: null,
  fsn_date:     '2026-06-01',
  source_url:   'https://www.bfarm.de/late',
  raw_content:  'Device field safety notice',
  source_db:    'bfarm',
}

const scrapeBfarm = vi.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, 181_000))
  return { items: [bfarmItem], warnings: ['BfArM completed within its own source budget'] }
})

vi.mock('@/lib/scrapers/bfarm', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/scrapers/bfarm')>(),
  scrapeBfarm,
}))

vi.mock('@/lib/scrapers/mhra', () => ({ scrapeMhra: vi.fn() }))
vi.mock('@/lib/scrapers/mhra-excel', () => ({ scrapeMhraExcel: vi.fn() }))
vi.mock('@/lib/scrapers/fda-maude', () => ({ scrapeFdaMaude: vi.fn() }))
vi.mock('@/lib/scrapers/swissmedic', () => ({ scrapeSwissmedic: vi.fn() }))
vi.mock('@/lib/sync/coverage', () => ({
  getCoveredRanges: vi.fn(),
  computeUncoveredRanges: vi.fn(),
  mergeCoverage: vi.fn(),
  overlapWindowStart: vi.fn(),
}))
vi.mock('@/lib/sync/canonical', () => ({
  upsertCanonical: vi.fn(async (items: ScrapedFsn[]) => items.map((item) => ({
    canonical_id:     `canonical-${item.external_id}`,
    content_changed:  false,
  }))),
  getCanonicalItems: vi.fn(),
}))
vi.mock('@/lib/pipeline/stages/insert-results', () => ({
  insertResultsStage: vi.fn(async (ctx: PipelineContext) => {
    ctx.insertedRows.push(...ctx.items.map((item) => ({
      ...item,
      id:     item.external_id,
      run_id: ctx.runId,
    })))
  }),
}))

describe('scrapeStage source timeouts', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    scrapeBfarm.mockClear()
  })

  it('does not apply the generic 180s wrapper to BfArM because BfArM owns its source budget', async () => {
    vi.useFakeTimers()
    const { scrapeStage } = await import('@/lib/pipeline/stages/scrape')

    const ctx = {
      runId: 'run-1',
      payload: {
        profile_id:    'profile-1',
        user_id:       'user-1',
        period_from:   '2026-06-01',
        period_to:     '2026-06-30',
        selected_dbs:  ['bfarm'],
        force_refresh: true,
      },
      db:              {},
      profile:         { device_name: 'Device', manufacturer: 'Acme', intended_use: null, emdn_code: null, device_class: null, search_strategy: null },
      aiOptOut:        false,
      searchTerms:     ['device'],
      competitorTerms: [],
      activeSources:   ['bfarm'],
      items:           [],
      insertedRows:    [],
      decisions:       [],
      warnings:        [],
      contentChanged:  new Set<string>(),
      canonicalIds:    new Map<string, string>(),
      timing:          {},
      isCancelled:     vi.fn(async () => false),
    } satisfies PipelineContext

    const pending = scrapeStage(ctx)

    await vi.advanceTimersByTimeAsync(181_000)
    await expect(pending).resolves.toBeUndefined()
    expect(ctx.warnings).toEqual(['BfArM completed within its own source budget'])
    expect(ctx.insertedRows).toHaveLength(1)
  })
})
