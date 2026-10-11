import { createHash } from 'node:crypto'
import { accuracyDatasetSchema, accuracyPolicySchema } from './accuracy-gate.schema'

import type {
  AccuracyBenchmarkCase,
  AccuracyGateOptions,
  AccuracyGateReport,
  AccuracyProviderDecision,
  FrozenAccuracyDataset,
  ProviderBenchmarkResult,
  RecallMetric,
  StratifiedRecall,
  WilsonInterval,
} from './accuracy-gate.types'

const Z_95 = 1.959963984540054

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
}

export function computeDatasetSha256(dataset: FrozenAccuracyDataset): string {
  const hashable: Partial<FrozenAccuracyDataset> = { ...dataset }
  delete hashable.expected_sha256
  return createHash('sha256').update(canonicalize(hashable), 'utf8').digest('hex')
}

export function assertFrozenDataset(dataset: FrozenAccuracyDataset): string {
  accuracyDatasetSchema.parse(dataset)
  if (dataset.schema_version !== 1) throw new Error(`Unsupported accuracy dataset schema: ${dataset.schema_version}`)
  if (dataset.adjudication.status !== 'prrc_adjudicated') {
    throw new Error('Accuracy release gates require a PRRC-adjudicated dataset')
  }
  if (!Number.isInteger(dataset.adjudication.reviewer_count) || dataset.adjudication.reviewer_count < 1) {
    throw new Error('Accuracy dataset must identify at least one adjudicating reviewer')
  }
  if (dataset.cases.length === 0) throw new Error('Accuracy dataset contains no cases')
  if (new Set(dataset.cases.map((item) => item.id)).size !== dataset.cases.length) {
    throw new Error('Accuracy dataset case IDs must be unique')
  }

  const actual = computeDatasetSha256(dataset)
  if (actual !== dataset.expected_sha256.toLowerCase()) {
    throw new Error(`Frozen accuracy dataset hash mismatch: expected ${dataset.expected_sha256}, received ${actual}`)
  }
  return actual
}

function metricBlockers(metric: RecallMetric, label: string, minimumCases: number, minimumRecall: number, minimumLowerBound: number): string[] {
  const blockers: string[] = []
  if (metric.relevant_total < minimumCases) blockers.push(`${label}: fewer than ${minimumCases} relevant cases`)
  if (metric.recall === null || metric.recall < minimumRecall) blockers.push(`${label}: recall is below ${minimumRecall}`)
  if (metric.interval_95 === null || metric.interval_95.lower < minimumLowerBound) {
    blockers.push(`${label}: Wilson 95% recall lower bound is below ${minimumLowerBound}`)
  }
  return blockers
}

function coverageBlockers(cases: AccuracyBenchmarkCase[], surfaced: (item: AccuracyBenchmarkCase) => boolean, options: AccuracyGateOptions, label: string): string[] {
  const blockers = metricBlockers(recall(cases, surfaced), `${label} overall`, options.minimum_relevant_cases,
    label === 'deterministic prefilter' ? options.minimum_prefilter_recall : options.minimum_overall_recall,
    options.minimum_recall_lower_bound)
  for (const [field, required] of [
    ['source', options.required_sources],
    ['device_category', options.required_device_categories],
  ] as const) {
    // Check observed strata too: an unlisted weak category must not be hidden by its aggregate.
    for (const stratum of new Set([...required, ...cases.map((item) => item[field])])) {
      blockers.push(...metricBlockers(recall(cases.filter((item) => item[field] === stratum), surfaced),
        `${label} ${field} ${stratum}`, options.minimum_relevant_cases_per_stratum,
        options.minimum_stratum_recall, options.minimum_recall_lower_bound))
    }
  }
  return blockers
}

export function wilson95(successes: number, total: number): WilsonInterval | null {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 0 || successes > total) {
    throw new Error('Wilson interval counts must be non-negative integers with successes <= total')
  }
  if (total === 0) return null

  const proportion = successes / total
  const z2 = Z_95 * Z_95
  const denominator = 1 + z2 / total
  const centre = proportion + z2 / (2 * total)
  const margin = Z_95 * Math.sqrt((proportion * (1 - proportion) + z2 / (4 * total)) / total)
  return {
    confidence: 0.95,
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  }
}

function recall(cases: AccuracyBenchmarkCase[], surfaced: (item: AccuracyBenchmarkCase) => boolean): RecallMetric {
  const relevant = cases.filter((item) => item.ground_truth_relevant)
  const truePositives = relevant.filter(surfaced).length
  return {
    true_positives: truePositives,
    relevant_total: relevant.length,
    recall: relevant.length === 0 ? null : truePositives / relevant.length,
    interval_95: wilson95(truePositives, relevant.length),
  }
}

function stratify(
  cases: AccuracyBenchmarkCase[],
  field: 'source' | 'device_category',
  surfaced: (item: AccuracyBenchmarkCase) => boolean,
): StratifiedRecall[] {
  return [...new Set(cases.map((item) => item[field]))]
    .sort((a, b) => a.localeCompare(b))
    .map((stratum) => ({ stratum, ...recall(cases.filter((item) => item[field] === stratum), surfaced) }))
}

function providerKey(provider: string, model: string): string {
  return `${provider}/${model}`
}

function decisionFor(item: AccuracyBenchmarkCase, provider: string, model: string): AccuracyProviderDecision | undefined {
  return item.provider_decisions.find((decision) => decision.provider === provider && decision.model === model)
}

function validateProviderCoverage(dataset: FrozenAccuracyDataset): Array<{ provider: string; model: string; mode: 'production' | 'shadow' }> {
  const identities = new Map<string, { provider: string; model: string; mode: 'production' | 'shadow' }>()
  for (const item of dataset.cases) {
    const seen = new Set<string>()
    for (const decision of item.provider_decisions) {
      const key = providerKey(decision.provider, decision.model)
      if (seen.has(key)) throw new Error(`Duplicate provider decision ${key} on case ${item.id}`)
      seen.add(key)
      const existing = identities.get(key)
      if (existing && existing.mode !== decision.mode) throw new Error(`Provider ${key} mixes production and shadow modes`)
      identities.set(key, { provider: decision.provider, model: decision.model, mode: decision.mode })
    }
  }
  for (const identity of identities.values()) {
    const missing = dataset.cases.find((item) => !decisionFor(item, identity.provider, identity.model))
    if (missing) throw new Error(`Provider ${providerKey(identity.provider, identity.model)} has no decision for case ${missing.id}`)
  }
  return [...identities.values()].sort((a, b) => providerKey(a.provider, a.model).localeCompare(providerKey(b.provider, b.model)))
}

export function evaluateAccuracyGate(dataset: FrozenAccuracyDataset, options: AccuracyGateOptions): AccuracyGateReport {
  const datasetSha256 = assertFrozenDataset(dataset)
  accuracyPolicySchema.parse(options)
  const datasetBlockers = dataset.adjudication.reviewer_count < options.minimum_reviewer_count
    ? [`dataset has fewer than ${options.minimum_reviewer_count} adjudicating reviewers`] : []

  const prefilter = recall(dataset.cases, (item) => item.deterministic_prefilter_surfaced)
  const prefilterBlockers = coverageBlockers(dataset.cases, (item) => item.deterministic_prefilter_surfaced, options, 'deterministic prefilter')
  const prefilterPassed = prefilterBlockers.length === 0
  const identities = validateProviderCoverage(dataset)

  const providers: ProviderBenchmarkResult[] = identities.map((identity) => {
    const surfaced = (item: AccuracyBenchmarkCase) => decisionFor(item, identity.provider, identity.model)?.surfaced === true
    const overall = recall(dataset.cases, surfaced)
    const key = providerKey(identity.provider, identity.model)
    const baseline = options.baseline_recall_by_provider?.[key] ?? null
    const regression = overall.recall === null || baseline === null ? null : baseline - overall.recall
    const meetsRecall = overall.recall !== null && overall.recall >= options.minimum_overall_recall
    const meetsRegression = regression === null || regression <= options.maximum_recall_regression
    const configuredForProduction = identity.provider === options.production_provider.provider
      && identity.model === options.production_provider.model
    const blockers = [...datasetBlockers, ...coverageBlockers(dataset.cases, surfaced, options, 'provider'), ...prefilterBlockers]
    if (!meetsRegression) blockers.push(`recall regression exceeds ${options.maximum_recall_regression}`)
    if (identity.mode === 'shadow') blockers.push('shadow candidates are evaluation-only')
    if (!configuredForProduction) blockers.push('provider is not the configured production candidate')

    return {
      ...identity,
      overall,
      by_source: stratify(dataset.cases, 'source', surfaced),
      by_device_category: stratify(dataset.cases, 'device_category', surfaced),
      baseline_recall: baseline,
      regression,
      meets_recall_target: meetsRecall,
      meets_regression_gate: meetsRegression,
      production_authority: blockers.length === 0,
      blockers,
    }
  })

  const productionKey = providerKey(options.production_provider.provider, options.production_provider.model)
  const production = providers.find((provider) => providerKey(provider.provider, provider.model) === productionKey)
  const releaseBlockers: string[] = [...datasetBlockers, ...prefilterBlockers]
  if (!production) releaseBlockers.push(`production provider ${productionKey} is absent from the dataset`)
  else releaseBlockers.push(...production.blockers)

  return {
    dataset_id: dataset.dataset_id,
    dataset_version: dataset.version,
    dataset_sha256: datasetSha256,
    policy_sha256: createHash('sha256').update(canonicalize(options), 'utf8').digest('hex'),
    deterministic_prefilter: { ...prefilter, target: options.minimum_prefilter_recall, passed: prefilterPassed },
    providers,
    release_allowed: releaseBlockers.length === 0,
    release_blockers: [...new Set(releaseBlockers)],
  }
}
