export type AccuracySource = string

export interface AccuracyProviderDecision {
  provider: string
  model: string
  surfaced: boolean
  /** Shadow results are observational and can never authorize a release. */
  mode: 'production' | 'shadow'
}

export interface AccuracyBenchmarkCase {
  id: string
  source: AccuracySource
  device_category: string
  ground_truth_relevant: boolean
  /** Whether the deterministic prefilter retained the record for review/ranking. */
  deterministic_prefilter_surfaced: boolean
  provider_decisions: AccuracyProviderDecision[]
}

export interface FrozenAccuracyDataset {
  schema_version: 1
  dataset_id: string
  version: string
  frozen_at: string
  adjudication: {
    status: 'prrc_adjudicated'
    reviewer_count: number
    description?: string
  }
  cases: AccuracyBenchmarkCase[]
  /** SHA-256 of the canonical dataset with this field omitted. */
  expected_sha256: string
}

export interface WilsonInterval {
  confidence: 0.95
  lower: number
  upper: number
}

export interface RecallMetric {
  true_positives: number
  relevant_total: number
  recall: number | null
  interval_95: WilsonInterval | null
}

export interface StratifiedRecall extends RecallMetric {
  stratum: string
}

export interface ProviderBenchmarkResult {
  provider: string
  model: string
  mode: 'production' | 'shadow'
  overall: RecallMetric
  by_source: StratifiedRecall[]
  by_device_category: StratifiedRecall[]
  baseline_recall: number | null
  regression: number | null
  meets_recall_target: boolean
  meets_regression_gate: boolean
  production_authority: boolean
  blockers: string[]
}

export interface AccuracyGateOptions {
  production_provider: { provider: string; model: string }
  minimum_overall_recall: number
  minimum_prefilter_recall: number
  /** Maximum permitted absolute decrease versus baseline recall. */
  maximum_recall_regression: number
  baseline_recall_by_provider?: Record<string, number>
}

export interface AccuracyGateReport {
  dataset_id: string
  dataset_version: string
  dataset_sha256: string
  deterministic_prefilter: RecallMetric & {
    target: number
    passed: boolean
  }
  providers: ProviderBenchmarkResult[]
  release_allowed: boolean
  release_blockers: string[]
}
