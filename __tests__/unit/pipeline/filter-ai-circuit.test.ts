import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineContext } from '@/lib/pipeline/types'

const mocks = vi.hoisted(() => ({
  stage1Filter: vi.fn(),
}))

vi.mock('@/lib/claude/filter-pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claude/filter-pipeline')>()
  return {
    stage1Filter: mocks.stage1Filter,
    getProfileFingerprint: () => 'profile-fingerprint',
    buildRankingRequest: actual.buildRankingRequest,
    FILTER_PROMPT_VERSION: actual.FILTER_PROMPT_VERSION,
    PRODUCTION_FILTER_PROVIDER: actual.PRODUCTION_FILTER_PROVIDER,
    PRODUCTION_FILTER_MODEL: actual.PRODUCTION_FILTER_MODEL,
    // Real content-aware key so the test exercises the production cache-key path.
    getFsnExternalId: actual.getFsnExternalId,
  }
})
vi.mock('@/lib/scrapers/bfarm', () => ({ fetchBfarmDetail: vi.fn() }))

import {
  computeFilterInputSha256,
  computeFilterOutputSha256,
  filterStage,
  isTerminalAiAvailabilityFailure,
} from '@/lib/pipeline/stages/filter'
import { FILTER_PROMPT_VERSION, PRODUCTION_FILTER_MODEL, PRODUCTION_FILTER_PROVIDER } from '@/lib/claude/filter-pipeline'
import { PMS_CLASSIFICATION_RULESET_VERSION } from '@/lib/regulatory/pms-classification-rules'
// Resolves through the mock above to the ACTUAL implementation.
import { getFsnExternalId } from '@/lib/claude/filter-pipeline'

function fsnCacheId(row: { title: string; manufacturer?: string | null; raw_content?: string | null; source_db?: string | null }) {
  return getFsnExternalId({
    title:        row.title,
    manufacturer: row.manufacturer ?? '',
    raw_content:  row.raw_content ?? '',
    fsn_date:     null,
    source_db:    row.source_db,
  })
}

function context(cacheHits: Array<Record<string, unknown>> = []): PipelineContext {
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

function verifiedCacheHit(ctx: PipelineContext, row: PipelineContext['insertedRows'][number]) {
  const base = {
    fsn_external_id: fsnCacheId(row),
    decision: 'uncertain',
    reasoning: 'cached decision',
    confidence: '90',
    provider: PRODUCTION_FILTER_PROVIDER,
    model_id: PRODUCTION_FILTER_MODEL,
    prompt_version: FILTER_PROMPT_VERSION,
    ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
    input_sha256: computeFilterInputSha256(row, ctx.profile),
    original_decision_at: '2026-06-19T10:00:00.000Z',
    presentation_rank: 'low',
  }
  return {
    ...base,
    output_sha256: computeFilterOutputSha256({
      decision: base.decision,
      rationale: base.reasoning,
      confidence: base.confidence,
      provider: base.provider,
      modelId: base.model_id,
      promptVersion: base.prompt_version,
      rulesetVersion: base.ruleset_version,
      presentationRank: base.presentation_rank,
    }),
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
    const cacheHits = cachedRows.map((row) => verifiedCacheHit(baseCtx, row))
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

describe('pipeline accuracy safety ordering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('applies deterministic date scope before cache or model ranking', async () => {
    const ctx = context()
    ctx.insertedRows = [{
      ...ctx.insertedRows[0],
      fsn_date: '2026-05-31',
      raw_content: 'ordinary device notice',
    }]

    await filterStage(ctx)

    expect(mocks.stage1Filter).not.toHaveBeenCalled()
    expect(ctx.decisions).toMatchObject([{
      decision: 'excluded',
      decision_method: 'deterministic_scope',
      deterministic_reason_codes: ['DET_EXCLUDE_DATE_OUTSIDE_SCOPE'],
      cache_hit: false,
    }])
  })

  it('bypasses cache and model for vigilance language and always requires human review', async () => {
    const ctx = context()
    ctx.insertedRows = [{
      ...ctx.insertedRows[0],
      title: 'Urgent field safety corrective action after patient death',
      raw_content: 'The manufacturer initiated an FSCA.',
    }]

    await filterStage(ctx)

    expect(mocks.stage1Filter).not.toHaveBeenCalled()
    expect(ctx.decisions[0]).toMatchObject({
      decision: 'uncertain',
      decision_method: 'vigilance_bypass',
      presentation_rank: 'high',
      cache_hit: false,
    })
    expect(ctx.decisions[0].vigilance_reason_codes).toEqual(expect.arrayContaining([
      'VIGILANCE_DEATH',
      'VIGILANCE_FSCA',
    ]))
  })

  it('defensively coerces an excluded AI result to retained uncertain review', async () => {
    mocks.stage1Filter.mockResolvedValue({
      decision: 'excluded',
      rationale: 'Model attempted to exclude this record.',
      confidence: 0.99,
      model: PRODUCTION_FILTER_MODEL,
      provider: PRODUCTION_FILTER_PROVIDER,
      model_id: PRODUCTION_FILTER_MODEL,
      prompt_version: FILTER_PROMPT_VERSION,
      ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
      presentation_rank: 'low',
    })
    const ctx = context()
    ctx.insertedRows = [{ ...ctx.insertedRows[0], raw_content: 'ordinary device notice' }]

    await filterStage(ctx)

    expect(ctx.decisions[0]).toMatchObject({
      decision: 'uncertain',
      decision_method: 'ai_ranking',
      presentation_rank: 'low',
      cache_hit: false,
    })
    expect(ctx.decisions[0].rationale).toContain('AI-generated exclusion cannot remove a record')
  })

  it('fails closed to manual review when an existing cache row has legacy or mismatched provenance', async () => {
    const baseCtx = context()
    baseCtx.insertedRows = [{ ...baseCtx.insertedRows[0], raw_content: 'ordinary device notice' }]
    const legacyHit = {
      fsn_external_id: fsnCacheId(baseCtx.insertedRows[0]),
      decision: 'relevant',
      reasoning: 'legacy cached result',
      confidence: '90',
    }
    const ctx = context([legacyHit])
    ctx.insertedRows = baseCtx.insertedRows

    await filterStage(ctx)

    expect(mocks.stage1Filter).not.toHaveBeenCalled()
    expect(ctx.decisions[0]).toMatchObject({
      decision: 'filter_failed',
      decision_method: 'manual_review_required',
      error: 'unverifiable_cache_provenance',
      cache_hit: false,
    })
  })

  it('reuses a fully verified cache entry and preserves its original timestamp', async () => {
    const ctx = context()
    ctx.insertedRows = [{ ...ctx.insertedRows[0], raw_content: 'ordinary device notice' }]
    const verified = verifiedCacheHit(ctx, ctx.insertedRows[0])
    const cachedCtx = context([verified])
    cachedCtx.insertedRows = ctx.insertedRows

    await filterStage(cachedCtx)

    expect(mocks.stage1Filter).not.toHaveBeenCalled()
    expect(cachedCtx.decisions[0]).toMatchObject({
      decision: 'uncertain',
      decision_method: 'ai_ranking',
      provider: PRODUCTION_FILTER_PROVIDER,
      model_id: PRODUCTION_FILTER_MODEL,
      original_decision_at: '2026-06-19T10:00:00.000Z',
      cache_hit: true,
    })
  })
})
