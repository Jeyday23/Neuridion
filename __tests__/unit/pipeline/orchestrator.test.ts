import { describe, it, expect, vi } from 'vitest'

describe('runSearchPipeline orchestrator', () => {
  it('continues to finalize when a middle stage throws', async () => {
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
      createAdminClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ single: () => ({ data: { device_name: 'Test', manufacturer: 'Test', intended_use: null, emdn_code: null, device_class: null }, error: null }) }) }),
          update: () => ({ eq: () => ({ error: null }) }),
        }),
      }),
    }))
    vi.doMock('../../../lib/search/manufacturer-terms', () => ({
      buildManufacturerSearchTerms: () => [],
      extractManufacturerTerms: () => [],
    }))

    const { runSearchPipeline } = await import('../../../lib/pipeline/run-search')

    await runSearchPipeline('test-run-id', {
      profile_id: 'p1', period_from: '2026-01-01', period_to: '2026-01-31',
      selected_dbs: ['bfarm'], user_id: 'u1', force_refresh: false,
    })

    expect(stageOrder).toEqual(['scrape', 'insert', 'filter', 'persist', 'finalize'])
  })
})
