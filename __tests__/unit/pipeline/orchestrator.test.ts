import { describe, it, expect, vi } from 'vitest'

describe('runSearchPipeline orchestrator', () => {
  it('aborts pipeline when critical stage (filter) throws', async () => {
    const stageOrder: string[] = []

    vi.doMock('../../../lib/pipeline/stages/scrape', () => ({
      scrapeStage: async () => { stageOrder.push('scrape') },
    }))
    vi.doMock('../../../lib/pipeline/stages/insert-results', () => ({
      insertResultsStage: async () => { stageOrder.push('insert') },
    }))
    vi.doMock('../../../lib/pipeline/stages/filter', () => ({
      filterStage: async () => { stageOrder.push('filter'); throw new Error('AI unavailable') },
    }))
    vi.doMock('../../../lib/pipeline/stages/persist-decisions', () => ({
      persistDecisionsStage: async () => { stageOrder.push('persist') },
    }))
    vi.doMock('../../../lib/pipeline/stages/finalize', () => ({
      finalizeStage: async () => { stageOrder.push('finalize') },
    }))
    vi.doMock('../../../lib/supabase/admin', () => ({
      createAdminClient: () => {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          single: () => ({
            data: {
              id: 'p1', user_id: 'u1', device_name: 'Test', manufacturer: 'Test',
              intended_use: null, emdn_code: null, device_class: null,
              ifu_storage_path: null, search_strategy: null,
            },
            error: null,
          }),
          update: () => query,
        }
        return {
          from: () => query,
          storage: { from: () => ({ download: async () => ({ data: null, error: new Error('not called') }) }) },
        }
      },
    }))
    vi.doMock('../../../lib/search/manufacturer-terms', () => ({
      buildManufacturerSearchTerms: () => [],
      extractManufacturerTerms: () => [],
      extractCompetitorTokens: () => [],
    }))

    const { runSearchPipeline } = await import('../../../lib/pipeline/run-search')

    await runSearchPipeline('test-run-id', {
      profile_id: 'p1', period_from: '2026-01-01', period_to: '2026-01-31',
      selected_dbs: ['bfarm'], user_id: 'u1', force_refresh: false,
    })

    expect(stageOrder).toEqual(['scrape', 'filter'])
  })
})
