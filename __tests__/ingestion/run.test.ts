import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getCoveredRanges: vi.fn(),
  mergeCoverage: vi.fn(),
  getProductionScraper: vi.fn(),
  upsertCanonical: vi.fn(),
  captureAdapterOutput: vi.fn(),
  fetchBfarmRss: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))
vi.mock('@/lib/sync/coverage', () => ({
  getCoveredRanges: mocks.getCoveredRanges,
  mergeCoverage: mocks.mergeCoverage,
}))
vi.mock('@/lib/scrapers/registry', () => ({ getProductionScraper: mocks.getProductionScraper }))
vi.mock('@/lib/sync/canonical', () => ({ upsertCanonical: mocks.upsertCanonical }))
vi.mock('@/lib/evidence/store', () => ({ captureAdapterOutput: mocks.captureAdapterOutput }))
vi.mock('@/lib/scrapers/bfarm-rss', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scrapers/bfarm-rss')>()
  return { ...actual, fetchBfarmRss: mocks.fetchBfarmRss }
})

import { ingestSource } from '@/lib/ingestion/run'

const item = {
  external_id: 'ref-1', title: 'Notice', manufacturer: 'Acme', product_name: 'Pump',
  fsn_date: '2026-06-19', source_url: 'https://example.test/1', raw_content: 'Body', source_db: 'swissmedic',
}

function updateBuilder() {
  return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
}

describe('scheduled ingestion orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'ingestion_runs') return {
        update: vi.fn(() => updateBuilder()),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { source: 'swissmedic', window_from: '2023-06-21', window_to: '2026-06-20' },
              error: null,
            }),
          }),
        }),
      }
      throw new Error(`Unexpected table ${table}`)
    })
    mocks.getCoveredRanges.mockResolvedValue([])
    mocks.upsertCanonical.mockResolvedValue([{ canonical_id: '00000000-0000-4000-8000-000000000001' }])
    mocks.captureAdapterOutput.mockResolvedValue({ observations: 1, revisions: 1, authorityRevisionIds: new Map(), fetchId: 'fetch' })
    mocks.fetchBfarmRss.mockResolvedValue({ items: [], warnings: ['freshness only'], outcome: 'partial', archiveLimitationHit: true })
  })

  it('uses the production adapter, captures evidence, and atomically advances complete coverage', async () => {
    mocks.getProductionScraper.mockReturnValue(vi.fn().mockResolvedValue({
      items: [item], warnings: [], outcome: 'complete',
    }))
    const result = await ingestSource({
      runId: '00000000-0000-4000-8000-000000000010',
      source: 'swissmedic',
      asOfDate: '2026-06-20',
    })
    expect(result).toMatchObject({ outcome: 'complete', observations: 1, newRevisions: 1, duplicate: false })
    expect(mocks.captureAdapterOutput).toHaveBeenCalledOnce()
    expect(mocks.mergeCoverage).toHaveBeenCalledWith('swissmedic', {
      from: '2023-06-21', to: '2026-06-20',
    })
  })

  it('records partial evidence but does not certify coverage', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'ingestion_runs') return {
        update: vi.fn(() => updateBuilder()),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { source: 'mhra', window_from: '2023-06-21', window_to: '2026-06-20' },
              error: null,
            }),
          }),
        }),
      }
      throw new Error(`Unexpected table ${table}`)
    })
    mocks.getProductionScraper.mockReturnValue(vi.fn().mockResolvedValue({
      items: [item], warnings: ['channel unavailable'], outcome: 'partial',
    }))
    const result = await ingestSource({
      runId: '00000000-0000-4000-8000-000000000011',
      source: 'mhra',
      asOfDate: '2026-06-20',
    })
    expect(result.outcome).toBe('partial')
    expect(mocks.mergeCoverage).not.toHaveBeenCalled()
  })

  it('uses RSS as a BfArM freshness supplement without letting it certify coverage', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'ingestion_runs') return {
        update: vi.fn(() => updateBuilder()),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { source: 'bfarm', window_from: '2026-05-21', window_to: '2026-06-20' },
              error: null,
            }),
          }),
        }),
      }
      throw new Error(`Unexpected table ${table}`)
    })
    mocks.getProductionScraper.mockReturnValue(vi.fn().mockResolvedValue({
      items: [], warnings: [], outcome: 'empty',
    }))
    mocks.fetchBfarmRss.mockResolvedValue({
      items: [{ ...item, external_id: 'rss-1', source_db: 'bfarm' }],
      warnings: ['freshness only'],
      outcome: 'partial',
      archiveLimitationHit: true,
    })
    mocks.upsertCanonical.mockResolvedValue([{ canonical_id: '00000000-0000-4000-8000-000000000002' }])

    const result = await ingestSource({
      runId: '00000000-0000-4000-8000-000000000012',
      source: 'bfarm',
      asOfDate: '2026-06-20',
    })

    expect(result.outcome).toBe('partial')
    expect(mocks.fetchBfarmRss).toHaveBeenCalledWith({ fromDate: '2026-05-21', toDate: '2026-06-20' })
    expect(mocks.captureAdapterOutput.mock.calls[0][0].items).toHaveLength(1)
    expect(mocks.mergeCoverage).not.toHaveBeenCalled()
  })
})
