import { z } from 'zod'

const identity = z.string().min(1).refine((value) => value.trim() === value, 'Must not contain surrounding whitespace')
const probability = z.number().min(0).max(1)
const positiveCount = z.number().int().positive()
const uniqueIdentities = z.array(identity).min(1).refine((items) => new Set(items).size === items.length, 'Values must be unique')

export const accuracyDatasetSchema = z.strictObject({
  schema_version: z.literal(1),
  dataset_id: identity,
  version: identity,
  frozen_at: z.iso.datetime({ offset: true }),
  adjudication: z.strictObject({
    status: z.literal('prrc_adjudicated'),
    reviewer_count: positiveCount,
    description: z.string().optional(),
  }),
  cases: z.array(z.strictObject({
    id: identity,
    source: identity,
    device_category: identity,
    ground_truth_relevant: z.boolean(),
    deterministic_prefilter_surfaced: z.boolean(),
    provider_decisions: z.array(z.strictObject({
      provider: identity,
      model: identity,
      surfaced: z.boolean(),
      mode: z.enum(['production', 'shadow']),
    })).min(1),
  })).min(1),
  expected_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
})

export const accuracyPolicySchema = z.strictObject({
  production_provider: z.strictObject({ provider: identity, model: identity }),
  minimum_overall_recall: probability,
  minimum_prefilter_recall: probability,
  maximum_recall_regression: probability,
  baseline_recall_by_provider: z.record(identity, probability).optional(),
  minimum_reviewer_count: z.number().int().min(2),
  minimum_relevant_cases: positiveCount,
  minimum_relevant_cases_per_stratum: positiveCount,
  minimum_recall_lower_bound: probability,
  minimum_stratum_recall: probability,
  required_sources: uniqueIdentities,
  required_device_categories: uniqueIdentities,
})
