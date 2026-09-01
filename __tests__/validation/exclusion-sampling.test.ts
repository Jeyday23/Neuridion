import { describe, expect, it } from 'vitest'
import {
  deterministicDraw,
  hasSeriousEventLanguage,
  isBlindArmEligible,
  selectExclusionForReview,
  validateBlindArmPolicy,
  validateExclusionSamplingPolicy,
  type ExclusionCandidate,
} from '@/lib/validation/exclusion-sampling'

const candidate: ExclusionCandidate = {
  filterDecisionId: 'decision-1',
  fsnResultId: 'result-1',
  searchRunId: 'run-1',
  source: 'bfarm',
  language: 'de',
  deviceClass: 'IIb',
  confidence: 0.6,
  seriousEventSignal: true,
  challengerDecision: 'relevant',
}

describe('exclusion review sampling', () => {
  it('is deterministic for a frozen seed, record and arm', () => {
    const first = deterministicDraw('seed-1', 'draw-1', 'uniform_control')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(1)
    expect(deterministicDraw('seed-1', 'draw-1', 'uniform_control')).toBe(first)
    expect(deterministicDraw('seed-2', 'draw-1', 'uniform_control')).not.toBe(first)
  })

  it('stores the combined inclusion probability and all selection provenance', () => {
    const sample = selectExclusionForReview(candidate, 'frozen-seed', {
      version: 'test-policy-v1',
      uniformControlRate: 0.1,
      boundaryRate: 0.5,
      disagreementRate: 1,
      boundaryConfidenceMax: 0.7,
    })

    expect(sample).not.toBeNull()
    expect(sample?.inclusionProbability).toBe(1)
    expect(sample?.eligibleArms).toEqual(['uniform_control', 'boundary', 'disagreement'])
    expect(sample?.selectedByArms).toContain('disagreement')
    expect(sample?.stratum).toEqual({
      source: 'bfarm', language: 'de', device_class: 'IIb', seriousness: 'serious_signal',
    })
    expect(sample?.drawIdentifier).toMatch(/^[0-9a-f]{64}$/)
    expect(sample?.seedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(sample?.policySnapshot).toMatchObject({ version: 'test-policy-v1' })
  })

  it('keeps a non-zero uniform arm for unbiased coverage of every exclusion stratum', () => {
    expect(() => validateExclusionSamplingPolicy({
      version: 'bad-policy',
      uniformControlRate: 0,
      boundaryRate: 0.5,
      disagreementRate: 1,
      boundaryConfidenceMax: 0.7,
    })).toThrow(/greater than zero/)
  })

  it('caps preregistered blind-first eligibility at 10-20 percent', () => {
    expect(() => validateBlindArmPolicy({ version: 'blind-v1', fraction: 0.09 })).toThrow(/10-20%/)
    expect(() => validateBlindArmPolicy({ version: 'blind-v1', fraction: 0.21 })).toThrow(/10-20%/)
    expect(validateBlindArmPolicy({ version: 'blind-v1', fraction: 0.15 }).fraction).toBe(0.15)
    expect(isBlindArmEligible('record-1', 'run-seed', { version: 'blind-v1', fraction: 0.15 }))
      .toBe(isBlindArmEligible('record-1', 'run-seed', { version: 'blind-v1', fraction: 0.15 }))
  })

  it('detects serious-event language in English and German', () => {
    expect(hasSeriousEventLanguage('A patient died after the event')).toBe(true)
    expect(hasSeriousEventLanguage('Der Vorfall war lebensbedrohlich')).toBe(true)
    expect(hasSeriousEventLanguage('Routine labelling correction')).toBe(false)
  })
})
