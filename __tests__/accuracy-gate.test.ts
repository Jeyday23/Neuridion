import { describe, expect, it } from 'vitest'

import { computeDatasetSha256, evaluateAccuracyGate, wilson95 } from '../benchmark/accuracy-gate'
import type { FrozenAccuracyDataset } from '../benchmark/accuracy-gate.types'

function testDataset(): FrozenAccuracyDataset {
  const dataset: FrozenAccuracyDataset = {
    schema_version: 1,
    dataset_id: 'test-only',
    version: '1',
    frozen_at: '2026-09-03T00:00:00.000Z',
    adjudication: { status: 'prrc_adjudicated', reviewer_count: 2, description: 'synthetic unit-test fixture' },
    cases: [
      { id: 'a', source: 'bfarm', device_category: 'implant', ground_truth_relevant: true, deterministic_prefilter_surfaced: true, provider_decisions: [
        { provider: 'anthropic', model: 'sonnet', surfaced: true, mode: 'production' },
        { provider: 'cloudflare', model: 'glm', surfaced: true, mode: 'shadow' },
      ] },
      { id: 'b', source: 'bfarm', device_category: 'implant', ground_truth_relevant: true, deterministic_prefilter_surfaced: false, provider_decisions: [
        { provider: 'anthropic', model: 'sonnet', surfaced: true, mode: 'production' },
        { provider: 'cloudflare', model: 'glm', surfaced: true, mode: 'shadow' },
      ] },
      { id: 'c', source: 'mhra', device_category: 'software', ground_truth_relevant: true, deterministic_prefilter_surfaced: true, provider_decisions: [
        { provider: 'anthropic', model: 'sonnet', surfaced: false, mode: 'production' },
        { provider: 'cloudflare', model: 'glm', surfaced: true, mode: 'shadow' },
      ] },
      { id: 'd', source: 'mhra', device_category: 'software', ground_truth_relevant: false, deterministic_prefilter_surfaced: true, provider_decisions: [
        { provider: 'anthropic', model: 'sonnet', surfaced: true, mode: 'production' },
        { provider: 'cloudflare', model: 'glm', surfaced: true, mode: 'shadow' },
      ] },
    ],
    expected_sha256: '',
  }
  dataset.expected_sha256 = computeDatasetSha256(dataset)
  return dataset
}

describe('frozen recall accuracy gate', () => {
  it('computes Wilson 95% intervals', () => {
    expect(wilson95(0, 0)).toBeNull()
    const interval = wilson95(8, 10)
    expect(interval?.confidence).toBe(0.95)
    expect(interval?.lower).toBeCloseTo(0.4902, 3)
    expect(interval?.upper).toBeCloseTo(0.9433, 3)
  })

  it('rejects a changed frozen dataset', () => {
    const dataset = testDataset()
    dataset.cases[0].source = 'changed'
    expect(() => evaluateAccuracyGate(dataset, {
      production_provider: { provider: 'anthropic', model: 'sonnet' },
      minimum_overall_recall: 0.5,
      minimum_prefilter_recall: 0.5,
      maximum_recall_regression: 0.1,
    })).toThrow(/hash mismatch/)
  })

  it('reports overall and stratified recall and blocks prefilter failure', () => {
    const report = evaluateAccuracyGate(testDataset(), {
      production_provider: { provider: 'anthropic', model: 'sonnet' },
      minimum_overall_recall: 0.6,
      minimum_prefilter_recall: 0.8,
      maximum_recall_regression: 0.1,
      baseline_recall_by_provider: { 'anthropic/sonnet': 0.7 },
    })
    const anthropic = report.providers.find((item) => item.provider === 'anthropic')
    expect(anthropic?.overall.recall).toBeCloseTo(2 / 3)
    expect(anthropic?.by_source.find((item) => item.stratum === 'bfarm')?.recall).toBe(1)
    expect(anthropic?.by_device_category.find((item) => item.stratum === 'software')?.recall).toBe(0)
    expect(report.deterministic_prefilter.recall).toBeCloseTo(2 / 3)
    expect(report.release_allowed).toBe(false)
  })

  it('blocks excessive baseline regression', () => {
    const report = evaluateAccuracyGate(testDataset(), {
      production_provider: { provider: 'anthropic', model: 'sonnet' },
      minimum_overall_recall: 0.5,
      minimum_prefilter_recall: 0.5,
      maximum_recall_regression: 0.05,
      baseline_recall_by_provider: { 'anthropic/sonnet': 0.9 },
    })
    expect(report.release_allowed).toBe(false)
    expect(report.providers.find((item) => item.provider === 'anthropic')?.meets_regression_gate).toBe(false)
  })

  it('never grants production authority to a shadow candidate', () => {
    const report = evaluateAccuracyGate(testDataset(), {
      production_provider: { provider: 'cloudflare', model: 'glm' },
      minimum_overall_recall: 0.5,
      minimum_prefilter_recall: 0.5,
      maximum_recall_regression: 0.1,
    })
    const shadow = report.providers.find((item) => item.provider === 'cloudflare')
    expect(shadow?.overall.recall).toBe(1)
    expect(shadow?.production_authority).toBe(false)
    expect(report.release_allowed).toBe(false)
  })
})
