import { createHash } from 'crypto'

export type AiProviderId = 'anthropic' | 'cloudflare'
export type AiPresentationRank = 'high' | 'medium' | 'low'
export type AiDecisionMethod =
  | 'ai_ranking'
  | 'deterministic_scope'
  | 'vigilance_bypass'
  | 'manual_review_required'
  | 'ai_unavailable'

export const ANTHROPIC_PROVIDER_ID: AiProviderId = 'anthropic'
export const ANTHROPIC_PRODUCTION_MODEL = 'claude-sonnet-4-6'
export const CLOUDFLARE_PROVIDER_ID: AiProviderId = 'cloudflare'
export const CLOUDFLARE_GLM_SHADOW_MODEL = '@cf/zai-org/glm-4.7-flash'
export const CLOUDFLARE_NEMOTRON_SHADOW_MODEL = '@cf/nvidia/nemotron-3-120b-a12b'

export interface AiRankingRequest {
  systemPrompt: string
  userPrompt: string
  promptVersion: string
  rulesetVersion: string
  containsControlledEvidence: boolean
}

export interface AiDecisionProvenance {
  provider: AiProviderId
  model_id: string
  prompt_version: string
  ruleset_version: string
  input_sha256: string
  output_sha256: string
  original_decision_at: string
  presentation_rank: AiPresentationRank
  cache_hit: boolean
  decision_method: AiDecisionMethod
}

export interface AiRankingResult {
  rank: AiPresentationRank
  rationale: string
  confidence: number
  provenance: AiDecisionProvenance
}

export interface AiRankingProvider {
  readonly id: AiProviderId
  readonly model: string
  rank(request: AiRankingRequest): Promise<AiRankingResult>
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Canonical representation of the exact sanitized payload sent to a model. */
export function buildCanonicalModelInput(request: AiRankingRequest): string {
  return JSON.stringify({
    system_prompt: request.systemPrompt,
    user_prompt: request.userPrompt,
    prompt_version: request.promptVersion,
    ruleset_version: request.rulesetVersion,
    contains_controlled_evidence: request.containsControlledEvidence,
  })
}

/** SHA-256 of the exact canonical sanitized model input. */
export function computeInputSha256(request: AiRankingRequest): string {
  return sha256(buildCanonicalModelInput(request))
}

/** Hash the normalized provider result retained by Neuridion. */
export function computeOutputSha256(output: Pick<AiRankingResult, 'rank' | 'rationale' | 'confidence'>): string {
  return sha256(JSON.stringify({
    rank: output.rank,
    rationale: output.rationale,
    confidence: output.confidence,
  }))
}

// Backwards-compatible semantic aliases for callers that prefer ranking terms.
export const hashRankingInput = computeInputSha256
export const hashRankingOutput = computeOutputSha256

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

/** Normalize to the two-decimal precision represented by cache integer percent. */
export function normalizePersistedConfidence(value: number): number {
  return Math.round(clampConfidence(value) * 100) / 100
}

/**
 * AI ranks the review queue; it never has exclusion authority. A medium or low
 * rank remains uncertain and therefore reviewable.
 */
export function rankToReviewDecision(rank: AiPresentationRank): 'relevant' | 'uncertain' {
  return rank === 'high' ? 'relevant' : 'uncertain'
}
