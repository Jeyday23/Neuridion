import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { computeDatasetSha256, evaluateAccuracyGate, wilson95 } from '../benchmark/accuracy-gate'
import type { AccuracyGateOptions, FrozenAccuracyDataset } from '../benchmark/accuracy-gate.types'
import { runAccuracyGateCli } from '../benchmark/accuracy-gate.cli'

const policy: AccuracyGateOptions = {
  production_provider: { provider: 'anthropic', model: 'sonnet' },
  minimum_overall_recall: 0.5, minimum_prefilter_recall: 0.5, maximum_recall_regression: 0.1,
  minimum_reviewer_count: 2, minimum_relevant_cases: 1, minimum_relevant_cases_per_stratum: 1,
  minimum_recall_lower_bound: 0, minimum_stratum_recall: 0,
  required_sources: ['bfarm', 'mhra'], required_device_categories: ['implant', 'software'],
}

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
      ...policy,
      production_provider: { provider: 'anthropic', model: 'sonnet' },
      minimum_overall_recall: 0.5,
      minimum_prefilter_recall: 0.5,
      maximum_recall_regression: 0.1,
    })).toThrow(/hash mismatch/)
  })

  it('reports overall and stratified recall and blocks prefilter failure', () => {
    const report = evaluateAccuracyGate(testDataset(), {
      ...policy,
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
      ...policy,
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
      ...policy,
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

  it('blocks missing required sources and categories even when the aggregate meets its target', () => {
    const report = evaluateAccuracyGate(testDataset(), { ...policy,
      required_sources: ['bfarm', 'mhra', 'swissmedic'], required_device_categories: ['implant', 'software', 'pump'],
    })
    expect(report.release_allowed).toBe(false)
    expect(report.release_blockers).toContain('provider source swissmedic: fewer than 1 relevant cases')
    expect(report.release_blockers).toContain('provider device_category pump: fewer than 1 relevant cases')
  })

  it('blocks weak observed strata even if they are not listed as required', () => {
    const report = evaluateAccuracyGate(testDataset(), { ...policy, required_sources: ['bfarm'],
      required_device_categories: ['implant'], minimum_stratum_recall: 0.5,
    })
    expect(report.release_allowed).toBe(false)
    expect(report.release_blockers).toContain('provider source mhra: recall is below 0.5')
  })

  it('enforces relevant sample floors overall and by stratum', () => {
    const report = evaluateAccuracyGate(testDataset(), { ...policy, minimum_relevant_cases: 4, minimum_relevant_cases_per_stratum: 2 })
    expect(report.release_allowed).toBe(false)
    expect(report.release_blockers).toContain('provider overall: fewer than 4 relevant cases')
    // There are two MHRA records, but only one relevant record belongs in the recall denominator.
    expect(report.release_blockers).toContain('provider source mhra: fewer than 2 relevant cases')
  })

  it('blocks a perfect point estimate with insufficient Wilson lower-bound evidence', () => {
    const dataset = testDataset()
    for (const item of dataset.cases) {
      item.deterministic_prefilter_surfaced = true
      for (const decision of item.provider_decisions) decision.surfaced = true
    }
    dataset.expected_sha256 = computeDatasetSha256(dataset)
    const report = evaluateAccuracyGate(dataset, { ...policy, minimum_recall_lower_bound: 0.9 })
    expect(report.providers[0].overall.recall).toBe(1)
    expect(report.release_allowed).toBe(false)
    expect(report.release_blockers).toContain('provider overall: Wilson 95% recall lower bound is below 0.9')
  })

  it('enforces the adjudicating reviewer floor', () => {
    const dataset = testDataset()
    dataset.adjudication.reviewer_count = 1
    dataset.expected_sha256 = computeDatasetSha256(dataset)
    expect(evaluateAccuracyGate(dataset, policy).release_blockers).toContain('dataset has fewer than 2 adjudicating reviewers')
  })

  it('rejects malformed labels instead of treating truthy strings as ground truth', () => {
    const dataset = testDataset()
    Object.assign(dataset.cases[0], { ground_truth_relevant: 'false' })
    dataset.expected_sha256 = computeDatasetSha256(dataset)
    expect(() => evaluateAccuracyGate(dataset, policy)).toThrow(/ground_truth_relevant/)
  })

  it('rejects empty, incomplete, misspelled, and invalid policies', () => {
    for (const invalid of [
      { ...policy, required_sources: [] }, { ...policy, minimum_relevant_cases: 0 },
      { ...policy, minimum_relevant_cases: 1.5 }, { ...policy, minimum_reviewer_count: 1 },
      { ...policy, minimum_recall_lower_bound: NaN }, { ...policy, minimum_stratum_recall: undefined },
      { ...policy, baseline_recall_by_provider: { 'anthropic/sonnet': 2 } },
      { ...policy, required_source: ['bfarm'] },
    ]) {
      // Deliberately pass invalid runtime JSON to exercise validation.
      // @ts-expect-error missing policy fields are rejected at runtime
      expect(() => evaluateAccuracyGate(testDataset(), invalid)).toThrow()
    }
  })

  it('rejects absent and duplicate provider decisions', () => {
    const dataset = testDataset()
    dataset.cases[0].provider_decisions.pop()
    dataset.expected_sha256 = computeDatasetSha256(dataset)
    expect(() => evaluateAccuracyGate(dataset, policy)).toThrow(/has no decision/)
    dataset.cases[0].provider_decisions.push(dataset.cases[0].provider_decisions[0])
    dataset.expected_sha256 = computeDatasetSha256(dataset)
    expect(() => evaluateAccuracyGate(dataset, policy)).toThrow(/Duplicate provider/)
  })

  it('retains a policy fingerprint and permits an explicitly satisfied policy', () => {
    const report = evaluateAccuracyGate(testDataset(), policy)
    expect(report.release_allowed).toBe(true)
    expect(report.policy_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(evaluateAccuracyGate(testDataset(), { ...policy, minimum_relevant_cases: 2 }).policy_sha256).not.toBe(report.policy_sha256)
  })
})

describe('accuracy gate CLI', () => {
  it('fails closed on missing paths, unknown arguments, malformed JSON and unmet policy; prints a passing report', () => {
    const folder = mkdtempSync(join(tmpdir(), 'neuridion-accuracy-test-'))
    const datasetPath = join(folder, 'dataset.json')
    const policyPath = join(folder, 'policy.json')
    const output: string[] = []
    const errors: string[] = []
    const run = (args: string[]) => runAccuracyGateCli(args, (text) => output.push(text), (text) => errors.push(text))
    try {
      expect(run([])).toBe(1)
      expect(run(['--dataset', datasetPath, '--unknown', policyPath])).toBe(1)
      expect(run(['--dataset', datasetPath, '--policy', policyPath])).toBe(1)
      writeFileSync(datasetPath, '{broken')
      writeFileSync(policyPath, JSON.stringify(policy))
      expect(run(['--dataset', datasetPath, '--policy', policyPath])).toBe(1)
      writeFileSync(datasetPath, JSON.stringify(testDataset()))
      expect(run(['--policy', policyPath, '--dataset', datasetPath])).toBe(0)
      expect(JSON.parse(output.at(-1)!).release_allowed).toBe(true)
      writeFileSync(policyPath, JSON.stringify({ ...policy, minimum_relevant_cases: 100 }))
      expect(run(['--dataset', datasetPath, '--policy', policyPath])).toBe(1)
      expect(JSON.parse(output.at(-1)!).release_allowed).toBe(false)
      expect(errors.every((text) => text.startsWith('Accuracy gate failed:'))).toBe(true)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
