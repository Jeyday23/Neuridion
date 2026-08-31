import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAdjudicationRecords } from '@/lib/adjudication/policy'
import type {
  AdjudicationEvent as StoredAdjudicationEvent,
  AdjudicationFilterDecision,
  ReviewRequirement,
} from '@/lib/adjudication/types'
import {
  adjudicationStage,
  isMaterialDowngrade,
  reviewerCredentialsReady,
  type AdjudicationEvent,
  type AdjudicationRecord,
} from '@/app/dashboard/archive/[id]/adjudication-review'

const decision: AdjudicationFilterDecision = {
  id: 'decision-1',
  fsn_result_id: 'result-1',
  decision: 'excluded',
  rationale: 'SECRET AI RATIONALE',
  confidence: 0.91,
  model_used: 'SECRET MODEL',
  prompt_version: 'SECRET PROMPT',
  authority_revision_id: null,
  evidence_parser_version: null,
  decided_at: '2026-08-31T09:00:00.000Z',
}

const requirement: ReviewRequirement = {
  id: 'requirement-1',
  search_run_id: 'run-1',
  fsn_result_id: 'result-1',
  filter_decision_id: decision.id,
      requirement_reason: 'sampled_exclusion',
      blind_review_required: true,
      blind_policy_version: 'blind-first-v1',
      blind_inclusion_probability: 0.15,
      source_reference_id: null,
  created_at: '2026-08-31T09:01:00.000Z',
}

function storedEvent(overrides: Partial<StoredAdjudicationEvent> = {}): StoredAdjudicationEvent {
  return {
    id: 'event-1',
    search_run_id: 'run-1',
    fsn_result_id: 'result-1',
    filter_decision_id: decision.id,
    reviewer_id: 'reviewer-1',
    phase: 'provisional_blind',
    disposition: 'relevant',
    confidence: 4,
    rationale: 'Independent review of the source evidence.',
    reviewer_role: 'prrc',
    qualification_attestation: 'Appointed PRRC for this device family',
    attests_qualified: true,
    blind_to_ai: true,
    provisional_event_id: null,
    supersedes_event_id: null,
    review_of_event_id: null,
    requires_second_review: false,
    material_change: false,
    serious_event_signal: false,
    ai_model_snapshot: null,
    ai_prompt_version_snapshot: null,
    authority_revision_id: null,
    evidence_parser_version_snapshot: null,
    created_at: '2026-08-31T09:02:00.000Z',
    ...overrides,
  }
}

describe('blind adjudication payload', () => {
  it('keeps AI decisions and aggregate AI outcome counts out of the initial RSC boundary', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'app/dashboard/archive/[id]/page.tsx'),
      'utf8',
    )

    expect(pageSource).not.toContain(".from('filter_decisions')")
    expect(pageSource).not.toContain('filter_decision:')
    expect(pageSource).not.toMatch(/relevant_count|uncertain_count|excluded_count|filter_failed_count/)
  })

  it('omits every AI decision field and outcome-revealing reason before provisional submission', () => {
    const [record] = buildAdjudicationRecords({
      results: [{
        id: 'result-1',
        title: 'Source title',
        manufacturer: 'Manufacturer',
        fsn_date: null,
        source_url: 'https://example.com/source',
        source_db: 'bfarm',
        raw_content: 'SERVER-ONLY RAW CONTENT',
      }],
      decisions: [decision],
      requirements: [requirement],
      events: [],
      viewerId: 'reviewer-1',
    })

    expect(record.ai_revealed).toBe(false)
    expect(Object.hasOwn(record, 'filter_decision')).toBe(false)
    expect(record.requirement_reasons).toEqual(['blind_validation'])

    const payload = JSON.stringify(record)
    expect(payload).not.toContain('filter_decision')
    expect(payload).not.toContain('SECRET AI RATIONALE')
    expect(payload).not.toContain('SECRET MODEL')
    expect(payload).not.toContain('SECRET PROMPT')
    expect(payload).not.toContain('sampled_exclusion')
    expect(payload).not.toContain('SERVER-ONLY RAW CONTENT')
  })

  it('releases the AI decision only after this viewer locks a blind provisional event', () => {
    const [record] = buildAdjudicationRecords({
      results: [{
        id: 'result-1', title: 'Source title', manufacturer: null, fsn_date: null,
        source_url: null, source_db: 'bfarm', raw_content: null,
      }],
      decisions: [decision],
      requirements: [requirement],
      events: [storedEvent()],
      viewerId: 'reviewer-1',
    })

    expect(record.ai_revealed).toBe(true)
    expect(record.filter_decision).toMatchObject({
      decision: 'excluded',
      rationale: 'SECRET AI RATIONALE',
    })
    expect(record.provisional_blind?.blind_to_ai).toBe(true)
  })
})

function publicEvent(overrides: Partial<AdjudicationEvent> = {}): AdjudicationEvent {
  return {
    id: 'public-event-1',
    phase: 'provisional_blind',
    disposition: 'relevant',
    confidence: 4,
    rationale: 'Independent evidence assessment.',
    reviewer_id: 'reviewer-1',
    reviewer_role: 'prrc',
    qualification_attestation: 'Appointed PRRC for this device family',
    blind_to_ai: true,
    requires_second_review: false,
    material_change: false,
    serious_event_signal: false,
    created_at: '2026-08-31T09:02:00.000Z',
    ...overrides,
  }
}

function uiRecord(overrides: Partial<AdjudicationRecord> = {}): AdjudicationRecord {
  return {
    fsn_result: {
      id: 'result-1', title: 'Source title', manufacturer: null, fsn_date: null,
      source_url: null, source_db: 'bfarm',
    },
    review_required: true,
    requirement_reasons: ['blind_validation'],
    blind_review_required: true,
    ai_revealed: false,
    provisional_blind: null,
    final: null,
    second_review: null,
    complete: false,
    ...overrides,
  }
}

describe('blind-first UI state machine', () => {
  it('moves from provisional to final, second review, disagreement resolution, and complete', () => {
    const provisional = publicEvent()
    const final = publicEvent({
      id: 'final-1', phase: 'final', disposition: 'excluded', confidence: null,
      blind_to_ai: false, requires_second_review: true, material_change: true,
    })

    expect(adjudicationStage(uiRecord())).toBe('provisional_blind')
    expect(adjudicationStage(uiRecord({
      ai_revealed: true,
      provisional_blind: provisional,
      filter_decision: {
        id: decision.id, decision: 'excluded', rationale: decision.rationale,
        confidence: decision.confidence, model_used: decision.model_used,
        prompt_version: decision.prompt_version, decided_at: decision.decided_at,
      },
    }))).toBe('final')
    expect(adjudicationStage(uiRecord({ provisional_blind: provisional, final }))).toBe('second_review')
    expect(adjudicationStage(uiRecord({
      ai_revealed: true,
      provisional_blind: null,
      final,
    }))).toBe('second_review')
    expect(adjudicationStage(uiRecord({
      provisional_blind: provisional,
      final,
      second_review: publicEvent({ phase: 'second_review', disposition: 'relevant' }),
    }))).toBe('resolution_required')
    expect(adjudicationStage(uiRecord({
      provisional_blind: provisional,
      final,
      second_review: publicEvent({ phase: 'second_review', disposition: 'excluded' }),
      complete: true,
    }))).toBe('complete')
  })

  it('requires stronger handling for a relevant or uncertain to excluded downgrade', () => {
    expect(isMaterialDowngrade(uiRecord({ provisional_blind: publicEvent() }), 'excluded')).toBe(true)
    expect(isMaterialDowngrade(uiRecord({
      blind_review_required: false,
      filter_decision: {
        id: decision.id, decision: 'uncertain', rationale: decision.rationale,
        confidence: decision.confidence, model_used: decision.model_used,
        prompt_version: decision.prompt_version, decided_at: decision.decided_at,
      },
    }), 'excluded')).toBe(true)
    expect(isMaterialDowngrade(uiRecord(), 'relevant')).toBe(false)
  })

  it('blocks submission until reviewer authority is explicitly attested', () => {
    expect(reviewerCredentialsReady({
      role: 'prrc', qualificationAttestation: 'Appointed PRRC', attestsQualified: false,
    })).toBe(false)
    expect(reviewerCredentialsReady({
      role: 'prrc', qualificationAttestation: 'Appointed PRRC', attestsQualified: true,
    })).toBe(true)
  })
})
