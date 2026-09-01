import { canonicalJson, sha256Hex } from '@/lib/evidence/hash'

export type SamplingArm = 'uniform_control' | 'boundary' | 'disagreement'

export interface ExclusionSamplingPolicy {
  version: string
  uniformControlRate: number
  boundaryRate: number
  disagreementRate: number
  boundaryConfidenceMax: number
}

export interface ExclusionCandidate {
  filterDecisionId: string
  fsnResultId: string
  searchRunId: string
  source: string
  language: string
  deviceClass: string
  confidence: number | null
  seriousEventSignal: boolean
  challengerDecision?: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed' | null
  challengerVersion?: string | null
  challengerReason?: string | null
}

export interface ExclusionReviewSample {
  filterDecisionId: string
  fsnResultId: string
  searchRunId: string
  policyVersion: string
  inclusionProbability: number
  stratum: {
    source: string
    language: string
    device_class: string
    seriousness: 'serious_signal' | 'other'
  }
  eligibleArms: SamplingArm[]
  selectedByArms: SamplingArm[]
  selectionReason: string
  drawIdentifier: string
  drawSeed: string
  seedHash: string
  policySnapshot: Record<string, string | number>
  selectionContext: Record<string, string | number | boolean | null>
  selectedAt: string
}

export const DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION = 'exclusion-challenger-v1'

export interface ExclusionChallengerInput {
  title?: string | null
  manufacturer?: string | null
  rawContent?: string | null
  profileDeviceName: string
  profileManufacturer: string
  competitorTerms?: string[]
}

export interface ExclusionChallengerResult {
  decision: 'uncertain' | 'excluded'
  reason: string
  version: typeof DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION
}

const CHALLENGER_STOP_WORDS = new Set([
  'device', 'devices', 'medical', 'system', 'systems', 'product', 'products',
  'with', 'from', 'this', 'that', 'und', 'oder', 'medizin', 'systeme',
])

function normalizeChallengerText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function significantTerms(value: string): string[] {
  return [...new Set(normalizeChallengerText(value).split(' ')
    .filter((term) => term.length >= 4 && !CHALLENGER_STOP_WORDS.has(term)))]
}

/**
 * Cheap, independent high-recall challenger used only to mine disagreements
 * from AI exclusions. It never makes the regulatory disposition. Exact
 * manufacturer/device phrases and multi-token device identity signals are
 * intentionally escalated to `uncertain` for human review.
 */
export function runDeterministicExclusionChallenger(
  input: ExclusionChallengerInput,
): ExclusionChallengerResult {
  const corpus = normalizeChallengerText([
    input.title,
    input.manufacturer,
    input.rawContent,
  ].filter(Boolean).join(' '))
  const manufacturer = normalizeChallengerText(input.profileManufacturer)
  const device = normalizeChallengerText(input.profileDeviceName)

  if (manufacturer.length >= 4 && corpus.includes(manufacturer)) {
    return {
      decision: 'uncertain',
      reason: 'exact_profile_manufacturer_signal',
      version: DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION,
    }
  }
  if (device.length >= 5 && corpus.includes(device)) {
    return {
      decision: 'uncertain',
      reason: 'exact_profile_device_signal',
      version: DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION,
    }
  }

  const matchedDeviceTerms = significantTerms(input.profileDeviceName)
    .filter((term) => corpus.includes(term))
  if (matchedDeviceTerms.length >= 2) {
    return {
      decision: 'uncertain',
      reason: 'multi_token_profile_device_signal',
      version: DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION,
    }
  }

  for (const competitorTerm of input.competitorTerms ?? []) {
    const normalized = normalizeChallengerText(competitorTerm)
    if (normalized.length >= 5 && corpus.includes(normalized)) {
      return {
        decision: 'uncertain',
        reason: 'configured_similar_device_signal',
        version: DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION,
      }
    }
  }

  return {
    decision: 'excluded',
    reason: 'no_independent_identity_signal',
    version: DETERMINISTIC_EXCLUSION_CHALLENGER_VERSION,
  }
}

export const DEFAULT_EXCLUSION_SAMPLING_POLICY: ExclusionSamplingPolicy = Object.freeze({
  version: 'exclusion-review-v1',
  // A small, unbiased control arm remains eligible across the entire excluded pool.
  uniformControlRate: 0.02,
  // Targeted arms are for defect discovery. Their inclusion probabilities are
  // retained so later estimates can be weighted correctly.
  boundaryRate: 0.25,
  disagreementRate: 1,
  boundaryConfidenceMax: 0.7,
})

const SERIOUS_EVENT_LANGUAGE = /\b(?:death|died|fatal|serious injury|hospitali[sz](?:ation|ed)|life[- ]threatening|patient harm(?:ed)?|tod(?:esfall)?|tödlich|verstorben|schwerwiegend|lebensbedrohlich|patientenschaden)\b/i

export function hasSeriousEventLanguage(...text: Array<string | null | undefined>): boolean {
  return SERIOUS_EVENT_LANGUAGE.test(text.filter(Boolean).join(' '))
}

export function inferValidationLanguage(source: string): string {
  if (source === 'bfarm') return 'de'
  if (source === 'mhra' || source === 'fda') return 'en'
  if (source === 'swissmedic') return 'mixed'
  return 'unknown'
}

function assertProbability(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
}

export function validateExclusionSamplingPolicy(
  policy: ExclusionSamplingPolicy,
): ExclusionSamplingPolicy {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(policy.version)) {
    throw new TypeError('Sampling policy version must be a stable 3-64 character identifier')
  }
  assertProbability('uniformControlRate', policy.uniformControlRate)
  assertProbability('boundaryRate', policy.boundaryRate)
  assertProbability('disagreementRate', policy.disagreementRate)
  assertProbability('boundaryConfidenceMax', policy.boundaryConfidenceMax)
  if (policy.uniformControlRate === 0) {
    throw new RangeError('uniformControlRate must be greater than zero for unbiased coverage')
  }
  return policy
}

/**
 * Stable pseudo-random draw in [0, 1). The stored policy version, seed hash and
 * draw identifier make a selection reproducible without reconstructing rules
 * from whatever configuration happens to be current later.
 */
export function deterministicDraw(seed: string, drawIdentifier: string, arm: SamplingArm | 'blind'): number {
  const hash = sha256Hex(`${seed}\u0000${drawIdentifier}\u0000${arm}`)
  // 13 hex digits = 52 bits, exactly representable by a JS number.
  return Number.parseInt(hash.slice(0, 13), 16) / 0x10000000000000
}

function combinedProbability(probabilities: number[]): number {
  return 1 - probabilities.reduce((notSelected, probability) => notSelected * (1 - probability), 1)
}

/**
 * Selects exclusions using independent arms. `inclusionProbability` is the
 * probability of selection by any eligible arm, not the rate of the arm that
 * happened to fire. This is the value required for valid inverse-probability
 * weighting later.
 */
export function selectExclusionForReview(
  candidate: ExclusionCandidate,
  seed: string,
  inputPolicy: ExclusionSamplingPolicy = DEFAULT_EXCLUSION_SAMPLING_POLICY,
  drawnAt: Date = new Date(),
): ExclusionReviewSample | null {
  const policy = validateExclusionSamplingPolicy(inputPolicy)
  if (seed.length === 0 || seed.length > 256) {
    throw new TypeError('Sampling seed must contain 1-256 characters')
  }
  if (Number.isNaN(drawnAt.getTime())) {
    throw new TypeError('Sampling draw time must be a valid date')
  }
  const isBoundary = candidate.seriousEventSignal
    || candidate.confidence == null
    || candidate.confidence <= policy.boundaryConfidenceMax
  const isDisagreement = candidate.challengerDecision != null
    && candidate.challengerDecision !== 'excluded'

  const rates = new Map<SamplingArm, number>([['uniform_control', policy.uniformControlRate]])
  if (isBoundary) rates.set('boundary', policy.boundaryRate)
  if (isDisagreement) rates.set('disagreement', policy.disagreementRate)

  const drawIdentifier = sha256Hex(canonicalJson({
    filterDecisionId: candidate.filterDecisionId,
    fsnResultId: candidate.fsnResultId,
    searchRunId: candidate.searchRunId,
    policyVersion: policy.version,
  }))
  const selectedByArms = [...rates.entries()]
    .filter(([arm, rate]) => deterministicDraw(seed, drawIdentifier, arm) < rate)
    .map(([arm]) => arm)
  if (selectedByArms.length === 0) return null

  const eligibleArms = [...rates.keys()]
  const inclusionProbability = combinedProbability([...rates.values()])
  const stratum = {
    source: candidate.source || 'unknown',
    language: candidate.language || 'unknown',
    device_class: candidate.deviceClass || 'unknown',
    seriousness: candidate.seriousEventSignal ? 'serious_signal' as const : 'other' as const,
  }

  return {
    filterDecisionId: candidate.filterDecisionId,
    fsnResultId: candidate.fsnResultId,
    searchRunId: candidate.searchRunId,
    policyVersion: policy.version,
    inclusionProbability,
    stratum,
    eligibleArms,
    selectedByArms,
    selectionReason: selectedByArms.join('+'),
    drawIdentifier,
    drawSeed: seed,
    seedHash: sha256Hex(seed),
    policySnapshot: {
      version: policy.version,
      uniform_control_rate: policy.uniformControlRate,
      boundary_rate: policy.boundaryRate,
      disagreement_rate: policy.disagreementRate,
      boundary_confidence_max: policy.boundaryConfidenceMax,
    },
    selectionContext: {
      confidence: candidate.confidence,
      serious_event_signal: candidate.seriousEventSignal,
      challenger_decision: candidate.challengerDecision ?? null,
      challenger_version: candidate.challengerVersion ?? null,
      challenger_reason: candidate.challengerReason ?? null,
    },
    selectedAt: drawnAt.toISOString(),
  }
}

export interface BlindArmPolicy {
  version: string
  fraction: number
}

export const DEFAULT_BLIND_ARM_POLICY: BlindArmPolicy = Object.freeze({
  version: 'blind-first-v1',
  fraction: 0.15,
})

export function validateBlindArmPolicy(policy: BlindArmPolicy): BlindArmPolicy {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(policy.version)) {
    throw new TypeError('Blind-arm policy version must be a stable 3-64 character identifier')
  }
  if (!Number.isFinite(policy.fraction) || policy.fraction < 0.1 || policy.fraction > 0.2) {
    throw new RangeError('Blind-arm fraction must stay within the preregistered 10-20% range')
  }
  return policy
}

export function isBlindArmEligible(
  recordKey: string,
  seed: string,
  inputPolicy: BlindArmPolicy = DEFAULT_BLIND_ARM_POLICY,
): boolean {
  const policy = validateBlindArmPolicy(inputPolicy)
  const drawIdentifier = sha256Hex(canonicalJson({ recordKey, policyVersion: policy.version }))
  return deterministicDraw(seed, drawIdentifier, 'blind') < policy.fraction
}
