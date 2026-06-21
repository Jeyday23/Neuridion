import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineContext } from '@/lib/pipeline/types'

const mocks = vi.hoisted(() => ({
  stage1Filter: vi.fn(),
}))

vi.mock('@/lib/claude/filter-pipeline', () => ({
  stage1Filter: mocks.stage1Filter,
  getProfileFingerprint: () => 'profile-fingerprint',
}))
vi.mock('@/lib/scrapers/bfarm', () => ({ fetchBfarmDetail: vi.fn() }))

import { filterStage, isTerminalAiAvailabilityFailure } from '@/lib/pipeline/stages/filter'

function context(): PipelineContext {
  const cacheQuery = {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }
  return {
    runId: 'run-1',
    payload: {
      profile_id: 'profile-1', period_from: '2026-06-01', period_to: '2026-06-20',
      selected_dbs: ['bfarm'], user_id: 'user-1', force_refresh: false,
    },
    db: { from: vi.fn(() => cacheQuery) } as unknown as PipelineContext['db'],
    profile: {
      device_name: 'Infusomat Space', manufacturer: 'B. Braun', intended_use: null,
      emdn_code: null, device_class: null, search_strategy: null,
    },
    aiOptOut: false,
    searchTerms: [],
    competitorTerms: [],
    activeSources: ['bfarm'],
    items: [],
    contentChanged: new Set(),
    canonicalIds: new Map(),
    insertedRows: Array.from({ length: 8 }, (_, index) => ({
      id: `result-${index}`, external_id: `external-${index}`, title: `Notice ${index}`,
      manufacturer: 'Acme', raw_content: 'Pump notice', fsn_date: '2026-06-19',
      source_db: 'bfarm', source_url: `https://example.test/${index}`,
    })),
    decisions: [],
    warnings: [],
    timing: {},
    isCancelled: vi.fn().mockResolvedValue(false),
  }
}

describe('AI filtering circuit breaker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recognizes billing and authentication failures but not generic API failures', () => {
    expect(isTerminalAiAvailabilityFailure({
      decision: 'filter_failed', rationale: 'manual review', confidence: null, model: null,
      error: 'Your credit balance is too low',
    })).toBe(true)
    expect(isTerminalAiAvailabilityFailure({
      decision: 'filter_failed', rationale: 'timeout', confidence: null, model: null,
      error: 'gateway timeout',
    })).toBe(false)
  })

  it('uses one probe request and marks the remaining items without more API calls', async () => {
    mocks.stage1Filter.mockResolvedValue({
      decision: 'filter_failed',
      rationale: 'AI filter could not be applied due to API error. This item requires manual review.',
      confidence: null,
      model: null,
      error: 'Your credit balance is too low to access the Anthropic API.',
    })
    const ctx = context()

    await filterStage(ctx)

    expect(mocks.stage1Filter).toHaveBeenCalledOnce()
    expect(ctx.decisions).toHaveLength(8)
    expect(ctx.decisions.every((decision) => decision.decision === 'filter_failed')).toBe(true)
    expect(ctx.warnings).toEqual([
      'AI filtering unavailable; unassessed results require manual review.',
    ])
  })
})
