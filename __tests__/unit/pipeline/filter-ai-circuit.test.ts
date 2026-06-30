import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
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

function fsnCacheId(row: { title: string; manufacturer?: string | null; source_db?: string | null }) {
  const key = [row.title, row.manufacturer ?? '', row.source_db ?? ''].join('|').toLowerCase().trim()
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

function context(cacheHits: Array<{ fsn_external_id: string; decision: string; reasoning: string | null; confidence: string | null }> = []): PipelineContext {
  const cacheQuery = {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: cacheHits, error: null }),
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
      manufacturer: 'Acme', raw_content: 'Infusomat Space pump notice', fsn_date: '2026-06-19',
      source_db: 'bfarm', source_url: `https://example.test/${index}`,
    })),
    decisions: [],
    warnings: [],
    timing: {},
    sourceBreakdown: [],
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

  it('uses one probe request and marks all fresh candidates unprocessed when AI billing is unavailable', async () => {
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
    expect(ctx.decisions.every((decision) => decision.model === 'deterministic-ai-unavailable')).toBe(true)
    expect(ctx.decisions.every((decision) => decision.confidence === null)).toBe(true)
    expect(ctx.decisions[0].rationale).toContain('No AI relevance classification was applied')
    expect(ctx.warnings).toEqual([
      'AI relevance review was unavailable because the AI provider rejected the request for billing/authentication reasons; manual PRRC review is required.',
    ])
    expect(ctx.timing).toMatchObject({
      ai_review_status: 'provider_unavailable',
      ai_review_provider_error: 'billing_or_authentication',
    })
  })

  it('records audit metrics that explain total rows versus fresh filter candidates', async () => {
    mocks.stage1Filter.mockResolvedValue({
      decision: 'uncertain',
      rationale: 'needs manual review',
      confidence: 0.5,
      model: 'test-model',
    })
    const baseCtx = context()
    const cachedRows = baseCtx.insertedRows.slice(0, 5)
    const cacheHits = cachedRows.map((row) => ({
      fsn_external_id: fsnCacheId(row),
      decision: 'excluded',
      reasoning: 'cached decision',
      confidence: '90',
    }))
    const ctx = context(cacheHits)

    await filterStage(ctx)

    expect(mocks.stage1Filter).toHaveBeenCalledTimes(3)
    expect(ctx.decisions).toHaveLength(8)
    expect(ctx.timing).toMatchObject({
      filter_total_items: 8,
      filter_cache_hits: 5,
      filter_needs_filter: 3,
      filter_content_changed: 0,
      filter_keyword_boosted: 3,
      filter_to_filter: 3,
      filter_cap_skipped: 0,
    })
  })

  it('marks records skipped by the AI review cap as unprocessed and warns PRRC users', async () => {
    const previousCap = process.env.MAX_FILTER_ITEMS_PER_RUN
    process.env.MAX_FILTER_ITEMS_PER_RUN = '3'
    mocks.stage1Filter.mockResolvedValue({
      decision: 'excluded',
      rationale: 'not relevant',
      confidence: 0.9,
      model: 'test-model',
    })
    const ctx = context()

    try {
      await filterStage(ctx)
    } finally {
      if (previousCap === undefined) delete process.env.MAX_FILTER_ITEMS_PER_RUN
      else process.env.MAX_FILTER_ITEMS_PER_RUN = previousCap
    }

    expect(mocks.stage1Filter).toHaveBeenCalledTimes(3)
    expect(ctx.decisions).toHaveLength(8)
    expect(ctx.decisions.filter((decision) => decision.decision === 'filter_failed')).toHaveLength(5)
    expect(ctx.warnings).toEqual([
      '5 raw source records were not AI-reviewed because the run review cap is 3; manual PRRC review is required.',
    ])
    expect(ctx.timing).toMatchObject({
      filter_to_filter: 3,
      filter_cap_skipped: 5,
      ai_review_cap: 3,
      ai_review_status: 'incomplete_cap',
    })
  })
})
