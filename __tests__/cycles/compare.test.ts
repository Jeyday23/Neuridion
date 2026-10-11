import { describe, it, expect } from 'vitest'
import {
  compareCycles,
  coverageStatus,
  periodRelation,
  type CycleRecordInput,
  type CycleRunSummary,
  type CycleSide,
} from '@/lib/cycles/compare'
import { effectiveDecisionsByResult } from '@/lib/cycles/effective'
import type { AdjudicationEvent } from '@/lib/adjudication/types'
import type { EffectiveDecision } from '@/lib/cycles/effective'

const AI = (decision: string): EffectiveDecision => ({ decision, origin: 'ai', human_state: null })
const HUMAN = (decision: string): EffectiveDecision => ({ decision, origin: 'human', human_state: 'complete' })

const PROFILE = {
  device_name: 'Infusion Pump X',
  manufacturer: 'Acme Medical GmbH',
  intended_use: 'IV infusion',
  emdn_code: 'Z12',
  device_class: 'IIb',
  search_strategy: null,
}
const TERMS = { manufacturer_terms: ['acme'], device_terms: ['infusion'], term_algorithm_version: '1' }

function run(overrides: Partial<CycleRunSummary> = {}): CycleRunSummary {
  const base: CycleRunSummary = {
    id: 'run-current',
    status: 'complete',
    review_status: 'draft',
    created_at: '2026-10-01T10:00:00Z',
    period_from: '2026-07-01',
    period_to: '2026-09-30',
    dbs_searched: ['bfarm', 'fda'],
    source_breakdown: [
      { source: 'bfarm', status: 'complete', requested_from: '2026-07-01', requested_to: '2026-09-30' },
      { source: 'fda', status: 'complete', requested_from: '2026-07-01', requested_to: '2026-09-30' },
    ],
    profile_snapshot: { ...PROFILE },
    terms_used: { ...TERMS },
  }
  return { ...base, ...overrides }
}

function prevRun(overrides: Partial<CycleRunSummary> = {}): CycleRunSummary {
  return run({
    id: 'run-previous',
    created_at: '2026-07-01T10:00:00Z',
    review_status: 'approved',
    period_from: '2026-04-01',
    period_to: '2026-09-30',
    source_breakdown: [
      { source: 'bfarm', status: 'complete', requested_from: '2026-04-01', requested_to: '2026-09-30' },
      { source: 'fda', status: 'complete', requested_from: '2026-04-01', requested_to: '2026-09-30' },
    ],
    ...overrides,
  })
}

function rec(id: string, overrides: Partial<CycleRecordInput> = {}): CycleRecordInput {
  return {
    result_id: id,
    source_db: 'bfarm',
    external_id: `ext-${id.replace(/^[cp]-/, '')}`,
    title: `Notice ${id}`,
    fsn_date: '2026-08-15',
    source_url: `https://example.org/${id}`,
    content_hash: 'hash-a',
    attachment_digest: 'digest-a',
    decision: AI('relevant'),
    ...overrides,
  }
}

function side(r: CycleRunSummary, records: CycleRecordInput[]): CycleSide {
  return { run: r, records }
}

describe('compareCycles', () => {
  it('reports no previous run without inventing a diff', () => {
    const out = compareCycles(side(run(), [rec('c-1')]), null)
    expect(out.previous_run_id).toBeNull()
    expect(out.completeness.comparable).toBe(false)
    expect(out.completeness.reasons[0]).toMatch(/No earlier complete or degraded run/)
    expect(out.records.new).toEqual([])
    expect(out.records.unchanged_count).toBe(0)
    expect(out.explanations[0]).toMatch(/No record-level comparison/)
  })

  it('classifies new, removed and unchanged records', () => {
    const current = side(run(), [rec('c-1'), rec('c-2')])
    const previous = side(prevRun(), [rec('p-1'), rec('p-3')])
    const out = compareCycles(current, previous)
    expect(out.previous_run_id).toBe('run-previous')
    expect(out.completeness).toEqual({ comparable: true, reasons: [] })
    expect(out.records.new.map((r) => r.external_id)).toEqual(['ext-2'])
    expect(out.records.new[0].context).toBe('previous_window_searched')
    expect(out.records.removed.map((r) => r.external_id)).toEqual(['ext-3'])
    expect(out.records.unverified_absence).toEqual([])
    expect(out.records.unchanged_count).toBe(1)
    expect(out.explanations.join('\n')).toContain('bfarm::ext-3')
    expect(out.explanations.every((line) => !/Limitation/.test(line))).toBe(true)
  })

  it('matches identity on source_db + external_id, not result id or title', () => {
    const current = side(run(), [rec('c-1', { source_db: 'fda', title: 'Renamed' })])
    const previous = side(prevRun(), [rec('p-1', { source_db: 'bfarm' })])
    const out = compareCycles(current, previous)
    expect(out.records.new).toHaveLength(1)
    expect(out.records.new[0].key).toBe('fda::ext-1')
    expect(out.records.removed.map((r) => r.key)).toEqual(['bfarm::ext-1'])
  })

  it('flags content-hash changes as modified', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { content_hash: 'hash-b' })]),
      side(prevRun(), [rec('p-1')]),
    )
    expect(out.records.modified).toHaveLength(1)
    expect(out.records.modified[0].changes).toEqual(['record_content'])
    expect(out.records.modified[0].previous_result_id).toBe('p-1')
    expect(out.records.unchanged_count).toBe(0)
  })

  it('flags an attachment-only change as modified', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { attachment_digest: 'digest-b' })]),
      side(prevRun(), [rec('p-1')]),
    )
    expect(out.records.modified).toHaveLength(1)
    expect(out.records.modified[0].changes).toEqual(['attachments'])
    expect(out.explanations.join('\n')).toMatch(/0 with changed record content, 1 with changed attached documents/)
  })

  it('treats a missing digest as unverified, not changed', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { attachment_digest: null })]),
      side(prevRun(), [rec('p-1')]),
    )
    expect(out.records.modified).toEqual([])
    expect(out.records.content_unverified_count).toBe(1)
    expect(out.records.unchanged_count).toBe(1)
  })

  it('reports an AI decision change with origins', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { decision: AI('excluded') })]),
      side(prevRun(), [rec('p-1', { decision: AI('relevant') })]),
    )
    expect(out.records.decision_changed).toHaveLength(1)
    expect(out.records.decision_changed[0].from).toEqual(AI('relevant'))
    expect(out.records.decision_changed[0].to).toEqual(AI('excluded'))
    expect(out.explanations.join('\n')).toMatch(/0 of these involve a final human disposition/)
  })

  it('reports a human-origin decision change distinctly from an AI one', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { decision: HUMAN('excluded') })]),
      side(prevRun(), [rec('p-1', { decision: AI('uncertain') })]),
    )
    const change = out.records.decision_changed[0]
    expect(change.from.origin).toBe('ai')
    expect(change.to.origin).toBe('human')
    expect(out.explanations.join('\n')).toMatch(/1 of these involve a final human disposition/)
  })

  it('does not report a change when only the origin differs but the decision is the same', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { decision: HUMAN('relevant') })]),
      side(prevRun(), [rec('p-1', { decision: AI('relevant') })]),
    )
    expect(out.records.decision_changed).toEqual([])
    expect(out.records.unchanged_count).toBe(1)
  })

  it('classifies an absence from a degraded source as unverified and marks the comparison not comparable', () => {
    const current = side(run({
      status: 'degraded',
      source_breakdown: [
        { source: 'bfarm', status: 'partial', requested_from: '2026-07-01', requested_to: '2026-09-30' },
        { source: 'fda', status: 'complete', requested_from: '2026-07-01', requested_to: '2026-09-30' },
      ],
    }), [rec('c-1')])
    const previous = side(prevRun(), [rec('p-1'), rec('p-2'), rec('p-9', { source_db: 'fda' })])
    const out = compareCycles(current, previous)

    expect(out.records.removed.map((r) => r.key)).toEqual(['fda::ext-9'])
    expect(out.records.unverified_absence).toHaveLength(1)
    expect(out.records.unverified_absence[0]).toMatchObject({
      key: 'bfarm::ext-2', reason: 'coverage_degraded', current_status: 'partial', previous_status: 'complete',
    })
    expect(out.completeness.comparable).toBe(false)
    expect(out.completeness.reasons).toEqual(expect.arrayContaining([
      'The current run finished with status degraded.',
      'Coverage for bfarm was not intact (current run: partial).',
    ]))
    expect(out.source_coverage.find((s) => s.source === 'bfarm')?.compared).toBe(false)
    expect(out.source_coverage.find((s) => s.source === 'fda')?.compared).toBe(true)
    expect(out.explanations.length).toBeGreaterThan(0)
    for (const line of out.explanations) expect(line).toMatch(/Limitation: not a like-for-like comparison/)
  })

  it('treats a previous-side failed source or missing breakdown as unverified', () => {
    const previous = side(prevRun({
      status: 'degraded',
      source_breakdown: [
        { source: 'bfarm', status: 'failed', requested_from: '2026-04-01', requested_to: '2026-09-30' },
      ],
    }), [rec('p-1'), rec('p-2', { source_db: 'fda' })])
    const out = compareCycles(side(run(), []), previous)
    expect(out.records.removed).toEqual([])
    expect(out.records.unverified_absence.map((r) => [r.key, r.previous_status])).toEqual([
      ['bfarm::ext-1', 'failed'],
      ['fda::ext-2', 'not_recorded'],
    ])
    expect(out.completeness.comparable).toBe(false)
  })

  it('reports an absence from a source the current run did not search as unverified, and as a scope change', () => {
    const out = compareCycles(
      side(run({ dbs_searched: ['bfarm'] }), []),
      side(prevRun(), [rec('p-1', { source_db: 'fda' })]),
    )
    expect(out.scope_changes.sources_removed).toEqual(['fda'])
    expect(out.records.removed).toEqual([])
    expect(out.records.unverified_absence[0]).toMatchObject({ reason: 'source_not_searched', current_status: 'not_searched' })
    // Not searching a source is a scope choice, not degraded retrieval.
    expect(out.completeness.comparable).toBe(true)
  })

  it('does not call a previous record removed when it is dated outside the current window', () => {
    const out = compareCycles(
      side(run(), []),
      side(prevRun(), [rec('p-1', { fsn_date: '2026-05-01' })]),
    )
    expect(out.records.removed).toEqual([])
    expect(out.records.outside_current_period.map((r) => r.key)).toEqual(['bfarm::ext-1'])
  })

  it('marks new records by whether the previous run could have returned them', () => {
    const out = compareCycles(
      side(run({ dbs_searched: ['bfarm', 'fda', 'mhra'], source_breakdown: [
        ...run().source_breakdown,
        { source: 'mhra', status: 'complete', requested_from: '2026-07-01', requested_to: '2026-09-30' },
      ] }), [
        rec('c-1', { fsn_date: '2026-08-01' }),
        rec('c-2', { fsn_date: '2026-03-01' }),
        rec('c-3', { source_db: 'mhra' }),
        rec('c-4', { fsn_date: null }),
      ]),
      side(prevRun(), []),
    )
    const ctx = Object.fromEntries(out.records.new.map((r) => [r.external_id, r.context]))
    expect(ctx).toEqual({
      'ext-1': 'previous_window_searched',
      'ext-2': 'outside_previous_window',
      'ext-3': 'source_not_previously_searched',
      'ext-4': 'date_unknown',
    })
    expect(out.scope_changes.sources_added).toEqual(['mhra'])
  })

  it('separates profile and term changes from newly found evidence', () => {
    const out = compareCycles(
      side(run({
        profile_snapshot: { ...PROFILE, device_name: 'Infusion Pump X2', default_dbs: ['bfarm'] },
        terms_used: { ...TERMS, device_terms: ['infusion', 'x2'] },
      }), [rec('c-1')]),
      side(prevRun({ profile_snapshot: { ...PROFILE } }), [rec('p-1')]),
    )
    expect(out.scope_changes.profile_fields_changed).toEqual([
      { field: 'device_name', from: 'Infusion Pump X', to: 'Infusion Pump X2' },
    ])
    expect(out.scope_changes.terms_changed).toBe(true)
    expect(out.scope_changes.terms_fields_changed.map((c) => c.field)).toEqual(['device_terms'])
    // Evidence side is untouched by the scope change.
    expect(out.records.new).toEqual([])
    expect(out.records.unchanged_count).toBe(1)
    const text = out.explanations.join('\n')
    expect(text).toMatch(/Profile fields changed between the runs: device_name\. This is a change in search scope, not new source evidence\./)
    expect(text).toMatch(/Search terms changed between the runs: device_terms/)
    expect(text).toMatch(/No record returned by the current run is absent from the previous run/)
  })

  it('ignores term list ordering and reports unchanged terms', () => {
    const out = compareCycles(
      side(run({ terms_used: { ...TERMS, manufacturer_terms: ['b', 'a'] } }), []),
      side(prevRun({ terms_used: { ...TERMS, manufacturer_terms: ['a', 'b'] } }), []),
    )
    expect(out.scope_changes.terms_changed).toBe(false)
  })

  it('reports unknown scope when snapshots or terms are missing', () => {
    const out = compareCycles(
      side(run({ profile_snapshot: null, terms_used: null }), []),
      side(prevRun(), []),
    )
    expect(out.scope_changes.profile_snapshot_available).toBe(false)
    expect(out.scope_changes.terms_changed).toBeNull()
  })

  it('computes period gap and overlap', () => {
    expect(periodRelation({ from: '2026-07-01', to: '2026-09-30' }, { from: '2026-04-01', to: '2026-06-30' }))
      .toEqual({ gap_days: 0, overlap_days: 0 })
    expect(periodRelation({ from: '2026-07-11', to: '2026-09-30' }, { from: '2026-04-01', to: '2026-06-30' }))
      .toEqual({ gap_days: 10, overlap_days: 0 })
    expect(periodRelation({ from: '2026-06-01', to: '2026-09-30' }, { from: '2026-04-01', to: '2026-06-30' }))
      .toEqual({ gap_days: 0, overlap_days: 30 })
    expect(periodRelation({ from: null, to: '2026-09-30' }, { from: '2026-04-01', to: '2026-06-30' }))
      .toEqual({ gap_days: null, overlap_days: null })
  })

  it('treats unknown breakdown statuses as not recorded', () => {
    const r = run({ source_breakdown: [{ source: 'bfarm', status: 'weird' }] })
    expect(coverageStatus(r, 'bfarm')).toBe('not_recorded')
    expect(coverageStatus(r, 'fda')).toBe('not_recorded')
    expect(coverageStatus(r, 'mhra')).toBe('not_searched')
  })

  it('does not match records without an external id and counts them', () => {
    const out = compareCycles(
      side(run(), [rec('c-1', { external_id: null })]),
      side(prevRun(), [rec('p-1', { external_id: null })]),
    )
    expect(out.records.new).toEqual([])
    expect(out.records.removed).toEqual([])
    expect(out.records.unidentified).toEqual({ current: 1, previous: 1 })
  })

  it('is deterministic regardless of input order', () => {
    const a = compareCycles(side(run(), [rec('c-2'), rec('c-1')]), side(prevRun(), [rec('p-3'), rec('p-4')]))
    const b = compareCycles(side(run(), [rec('c-1'), rec('c-2')]), side(prevRun(), [rec('p-4'), rec('p-3')]))
    expect(a).toEqual(b)
  })
})

describe('effectiveDecisionsByResult', () => {
  const decision = (id: string, resultId: string, value: string, at: string) =>
    ({ id, fsn_result_id: resultId, decision: value, decided_at: at })
  const event = (overrides: Partial<AdjudicationEvent>): AdjudicationEvent => ({
    id: 'e1', search_run_id: 'run', fsn_result_id: 'r1', filter_decision_id: 'd2', reviewer_id: 'u1',
    phase: 'final', disposition: 'excluded', confidence: 4, rationale: 'Different device family.',
    reviewer_role: 'prrc', qualification_attestation: 'PRRC qualified', attests_qualified: true,
    blind_to_ai: false, provisional_event_id: null, supersedes_event_id: null, review_of_event_id: null,
    requires_second_review: false, material_change: false, serious_event_signal: false,
    ai_model_snapshot: null, ai_prompt_version_snapshot: null, authority_revision_id: null,
    evidence_parser_version_snapshot: null, created_at: '2026-10-02T00:00:00Z',
    ...overrides,
  })

  it('uses the latest AI decision when no human disposition exists', () => {
    const out = effectiveDecisionsByResult(['r1'], [
      decision('d1', 'r1', 'uncertain', '2026-10-01T00:00:00Z'),
      decision('d2', 'r1', 'relevant', '2026-10-01T01:00:00Z'),
    ], [])
    expect(out.get('r1')).toEqual({ decision: 'relevant', origin: 'ai', human_state: null })
  })

  it('prefers a final human disposition covering the current AI decision', () => {
    const out = effectiveDecisionsByResult(['r1'], [
      decision('d2', 'r1', 'relevant', '2026-10-01T01:00:00Z'),
    ], [event({})])
    expect(out.get('r1')).toEqual({ decision: 'excluded', origin: 'human', human_state: 'complete' })
  })

  it('falls back to the AI decision when the human disposition covers an older assessment', () => {
    const out = effectiveDecisionsByResult(['r1'], [
      decision('d2', 'r1', 'relevant', '2026-10-01T01:00:00Z'),
      decision('d3', 'r1', 'uncertain', '2026-10-03T01:00:00Z'),
    ], [event({})])
    expect(out.get('r1')).toEqual({ decision: 'uncertain', origin: 'ai', human_state: 'stale' })
  })

  it('marks a disposition awaiting independent second review', () => {
    const out = effectiveDecisionsByResult(['r1'], [
      decision('d2', 'r1', 'relevant', '2026-10-01T01:00:00Z'),
    ], [event({ requires_second_review: true })])
    expect(out.get('r1')).toEqual({ decision: 'excluded', origin: 'human', human_state: 'pending_second_review' })
  })

  it('reports no decision when nothing was recorded', () => {
    const out = effectiveDecisionsByResult(['r1'], [], [])
    expect(out.get('r1')).toEqual({ decision: null, origin: 'none', human_state: null })
  })
})
