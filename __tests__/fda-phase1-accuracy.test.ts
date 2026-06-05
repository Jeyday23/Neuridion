import { describe, it, expect, vi } from 'vitest'
import { buildSourceSearchTerms } from '@/lib/pipeline/stages/scrape'
import { computeKeywordPriority } from '@/lib/pipeline/stages/filter'
import { finalizeStage, computeRunStatus } from '@/lib/pipeline/stages/finalize'
import type { PipelineContext, DecisionRow } from '@/lib/pipeline/types'

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email', () => ({
  sendSearchRunNotification: vi.fn().mockResolvedValue(undefined),
}))

// ---------- buildSourceSearchTerms (scrape.ts) ----------

describe('buildSourceSearchTerms', () => {
  const searchTerms = ['insulin pump', 'infusion']
  const competitorTerms = ['medtronic', 'tandem']

  it('FDA receives only searchTerms, never competitorTerms', () => {
    const terms = buildSourceSearchTerms('fda', searchTerms, competitorTerms)
    expect(terms).toEqual(['insulin pump', 'infusion'])
    expect(terms).not.toContain('medtronic')
    expect(terms).not.toContain('tandem')
  })

  it('BfArM receives searchTerms + competitorTerms', () => {
    const terms = buildSourceSearchTerms('bfarm', searchTerms, competitorTerms)
    expect(terms).toEqual(expect.arrayContaining(['insulin pump', 'infusion', 'medtronic', 'tandem']))
  })

  it('MHRA receives searchTerms + competitorTerms', () => {
    const terms = buildSourceSearchTerms('mhra', searchTerms, competitorTerms)
    expect(terms).toContain('medtronic')
  })

  it('Swissmedic receives searchTerms + competitorTerms', () => {
    const terms = buildSourceSearchTerms('swissmedic', searchTerms, competitorTerms)
    expect(terms).toContain('tandem')
  })

  it('deduplicates overlapping terms', () => {
    const result = buildSourceSearchTerms('bfarm', ['pump', 'valve'], ['pump'])
    expect(result).toEqual(['pump', 'valve'])
  })

  it('FDA with empty searchTerms returns empty', () => {
    expect(buildSourceSearchTerms('fda', [], competitorTerms)).toEqual([])
  })

  it('non-FDA with empty searchTerms returns only competitorTerms', () => {
    const terms = buildSourceSearchTerms('bfarm', [], ['medtronic'])
    expect(terms).toEqual(['medtronic'])
  })

  it('both inputs empty returns empty for all sources', () => {
    expect(buildSourceSearchTerms('fda', [], [])).toEqual([])
    expect(buildSourceSearchTerms('bfarm', [], [])).toEqual([])
  })
})

// ---------- computeKeywordPriority (filter.ts) ----------

describe('computeKeywordPriority', () => {
  const mfrTerms = ['acme medical']
  const devTerms = ['insulin pump']
  const compTerms = ['medtronic']

  it('tier 0: manufacturer + device match', () => {
    expect(computeKeywordPriority('Acme Medical insulin pump recall', mfrTerms, devTerms, compTerms)).toBe(0)
  })

  it('tier 1: device-only match', () => {
    expect(computeKeywordPriority('Generic Corp insulin pump alert', mfrTerms, devTerms, compTerms)).toBe(1)
  })

  it('tier 2: manufacturer-only match', () => {
    expect(computeKeywordPriority('Acme Medical ventilator recall', mfrTerms, devTerms, compTerms)).toBe(2)
  })

  it('tier 3: competitor-only match', () => {
    expect(computeKeywordPriority('Medtronic ventilator recall', mfrTerms, devTerms, compTerms)).toBe(3)
  })

  it('tier 4: no match', () => {
    expect(computeKeywordPriority('Unrelated surgical tool notice', mfrTerms, devTerms, compTerms)).toBe(4)
  })

  it('no source gets auto-boosted — FDA items scored the same as any other', () => {
    const fdaContent = 'FDA recall of unrelated device by unknown manufacturer'
    expect(computeKeywordPriority(fdaContent, mfrTerms, devTerms, compTerms)).toBe(4)
  })

  it('is case-insensitive', () => {
    expect(computeKeywordPriority('ACME MEDICAL INSULIN PUMP', mfrTerms, devTerms, compTerms)).toBe(0)
    expect(computeKeywordPriority('acme medical insulin pump', mfrTerms, devTerms, compTerms)).toBe(0)
  })

  it('empty manufacturer terms: mfr+device match impossible, device match still tier 1', () => {
    expect(computeKeywordPriority('Acme Medical insulin pump', [], devTerms, compTerms)).toBe(1)
  })

  it('empty device terms: device match impossible', () => {
    expect(computeKeywordPriority('Acme Medical ventilator', mfrTerms, [], compTerms)).toBe(2)
  })

  it('all terms empty: everything is tier 4', () => {
    expect(computeKeywordPriority('Acme Medical insulin pump', [], [], [])).toBe(4)
  })

  it('multi-word terms match as substrings', () => {
    expect(computeKeywordPriority('The Acme Medical Group announces recall', mfrTerms, devTerms, compTerms)).toBe(2)
  })

  it('sorts a realistic item set by priority', () => {
    const items = [
      { id: 'unrelated', hay: 'Surgical suture notice' },
      { id: 'competitor', hay: 'Medtronic pacemaker alert' },
      { id: 'target', hay: 'Acme Medical insulin pump recall' },
      { id: 'device', hay: 'Generic insulin pump warning' },
      { id: 'mfr', hay: 'Acme Medical stent recall' },
    ]

    const sorted = [...items].sort(
      (a, b) => computeKeywordPriority(a.hay, mfrTerms, devTerms, compTerms) -
                computeKeywordPriority(b.hay, mfrTerms, devTerms, compTerms),
    )

    expect(sorted.map(i => i.id)).toEqual(['target', 'device', 'mfr', 'competitor', 'unrelated'])
  })

  it('priority sort means target items reach AI filter before cap is hit', () => {
    const CAP = 3
    const items = [
      { id: 'noise1', hay: 'Random notice A' },
      { id: 'noise2', hay: 'Random notice B' },
      { id: 'target', hay: 'Acme Medical insulin pump recall' },
      { id: 'noise3', hay: 'Random notice C' },
      { id: 'noise4', hay: 'Random notice D' },
    ]

    const sorted = [...items].sort(
      (a, b) => computeKeywordPriority(a.hay, mfrTerms, devTerms, compTerms) -
                computeKeywordPriority(b.hay, mfrTerms, devTerms, compTerms),
    )

    const withinCap = sorted.slice(0, CAP)
    expect(withinCap.map(i => i.id)).toContain('target')
  })
})

// ---------- finalizeStage stats (finalize.ts) ----------

describe('finalizeStage total_results', () => {
  function buildMockCtx(decisions: DecisionRow[]): PipelineContext {
    let capturedUpdate: Record<string, unknown> | null = null

    const eqChain = { eq: vi.fn().mockResolvedValue({ error: null }) }
    const updateFn = vi.fn((payload: Record<string, unknown>) => {
      capturedUpdate = payload
      return eqChain
    })

    const singleChain = { single: vi.fn().mockResolvedValue({ data: null, error: null }) }
    const selectEqChain = { eq: vi.fn().mockReturnValue(singleChain) }
    const selectFn = vi.fn().mockReturnValue(selectEqChain)

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'search_runs') return { update: updateFn }
        if (table === 'users') return { select: selectFn }
        return {}
      }),
    }

    const ctx = {
      runId: 'test-run',
      payload: { user_id: 'u1', profile_id: 'p1', period_from: '2026-01-01', period_to: '2026-06-01', selected_dbs: ['bfarm'], force_refresh: false },
      db,
      profile: { device_name: 'Test', manufacturer: 'Test', intended_use: null, emdn_code: null, device_class: null, search_strategy: null },
      aiOptOut: false,
      searchTerms: [],
      competitorTerms: [],
      activeSources: ['bfarm'],
      items: [],
      contentChanged: new Set<string>(),
      canonicalIds: new Map<string, string>(),
      insertedRows: decisions.map((d, i) => ({
        id: d.fsn_result_id, external_id: `ext-${i}`, title: `Item ${i}`,
        manufacturer: null, raw_content: null, fsn_date: null, source_db: 'bfarm', source_url: null,
      })),
      decisions,
      warnings: [],
      timing: {},
      isCancelled: vi.fn().mockResolvedValue(false),
      _capturedUpdate: () => capturedUpdate,
    } as unknown as PipelineContext & { _capturedUpdate: () => Record<string, unknown> | null }

    return ctx
  }

  it('total_results excludes filter_failed items', async () => {
    const decisions: DecisionRow[] = [
      { fsn_result_id: 'r1', decision: 'relevant', rationale: '', confidence: 0.9, model: 'test' },
      { fsn_result_id: 'r2', decision: 'uncertain', rationale: '', confidence: 0.5, model: 'test' },
      { fsn_result_id: 'r3', decision: 'excluded', rationale: '', confidence: 0.9, model: 'test' },
      { fsn_result_id: 'r4', decision: 'filter_failed', rationale: 'cap', confidence: null, model: null },
      { fsn_result_id: 'r5', decision: 'filter_failed', rationale: 'cap', confidence: null, model: null },
    ]

    const ctx = buildMockCtx(decisions) as PipelineContext & { _capturedUpdate: () => Record<string, unknown> | null }
    await finalizeStage(ctx)

    const update = ctx._capturedUpdate()!
    expect(update.total_results).toBe(3)
    expect(update.relevant_count).toBe(1)
    expect(update.uncertain_count).toBe(1)
    expect(update.excluded_count).toBe(1)
    expect(update.filter_failed_count).toBe(2)
  })

  it('total_results is 0 when all items are filter_failed', async () => {
    const decisions: DecisionRow[] = [
      { fsn_result_id: 'r1', decision: 'filter_failed', rationale: 'cap', confidence: null, model: null },
      { fsn_result_id: 'r2', decision: 'filter_failed', rationale: 'cap', confidence: null, model: null },
    ]

    const ctx = buildMockCtx(decisions) as PipelineContext & { _capturedUpdate: () => Record<string, unknown> | null }
    await finalizeStage(ctx)

    const update = ctx._capturedUpdate()!
    expect(update.total_results).toBe(0)
    expect(update.filter_failed_count).toBe(2)
  })

  it('total_results equals sum of assessed categories when no filter_failed', async () => {
    const decisions: DecisionRow[] = [
      { fsn_result_id: 'r1', decision: 'relevant', rationale: '', confidence: 0.9, model: 'test' },
      { fsn_result_id: 'r2', decision: 'excluded', rationale: '', confidence: 0.8, model: 'test' },
    ]

    const ctx = buildMockCtx(decisions) as PipelineContext & { _capturedUpdate: () => Record<string, unknown> | null }
    await finalizeStage(ctx)

    const update = ctx._capturedUpdate()!
    expect(update.total_results).toBe(2)
    expect(update.filter_failed_count).toBe(0)
  })
})

// ---------- computeRunStatus (finalize.ts, already exported) ----------

describe('computeRunStatus (regression)', () => {
  it('returns complete with no warnings', () => {
    expect(computeRunStatus([], 10)).toBe('complete')
  })

  it('returns degraded with warnings and items', () => {
    expect(computeRunStatus(['partial results'], 5)).toBe('degraded')
  })
})
