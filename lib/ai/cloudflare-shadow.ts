import { z } from 'zod'
import {
  CLOUDFLARE_GLM_SHADOW_MODEL,
  CLOUDFLARE_NEMOTRON_SHADOW_MODEL,
  normalizePersistedConfidence,
  hashRankingInput,
  hashRankingOutput,
  type AiPresentationRank,
  type AiRankingRequest,
  type AiRankingResult,
} from './provider'

export const CLOUDFLARE_SHADOW_MODELS = Object.freeze({
  glm: CLOUDFLARE_GLM_SHADOW_MODEL,
  nemotron: CLOUDFLARE_NEMOTRON_SHADOW_MODEL,
})

export type CloudflareShadowModel = keyof typeof CLOUDFLARE_SHADOW_MODELS

export type CloudflareShadowOutcome =
  | { status: 'disabled' | 'skipped'; reason: string }
  | { status: 'completed'; authority: false; result: AiRankingResult }
  | { status: 'failed'; authority: false; error: string }

const ShadowResponseSchema = z.object({
  rank: z.enum(['high', 'medium', 'low']),
  rationale: z.string().min(1).max(2_000),
  confidence: z.number().min(0).max(1).default(0.5),
})

export function isCloudflareShadowEnabled(): boolean {
  return process.env.NEURIDION_CLOUDFLARE_SHADOW_ENABLED === 'true'
}

function selectedModel(): CloudflareShadowModel {
  return process.env.NEURIDION_CLOUDFLARE_SHADOW_MODEL === 'nemotron' ? 'nemotron' : 'glm'
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new Error('Cloudflare returned an invalid response')
  const envelope = payload as { result?: unknown }
  const result = envelope.result
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const value = result as { response?: unknown; output_text?: unknown }
    if (typeof value.response === 'string') return value.response
    if (typeof value.output_text === 'string') return value.output_text
  }
  throw new Error('Cloudflare response contained no model text')
}

function parseShadowResponse(text: string): {
  rank: AiPresentationRank
  rationale: string
  confidence: number
} {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return ShadowResponseSchema.parse(JSON.parse(cleaned))
}

/**
 * Evaluation-only challenger. Its return type fixes `authority` to false and
 * the production filter never calls it as a fallback. Controlled manufacturer
 * evidence is intentionally not sent through this optional path.
 */
export async function runCloudflareShadowRanking(
  request: AiRankingRequest,
): Promise<CloudflareShadowOutcome> {
  if (!isCloudflareShadowEnabled()) {
    return { status: 'disabled', reason: 'NEURIDION_CLOUDFLARE_SHADOW_ENABLED is not true' }
  }
  if (request.containsControlledEvidence) {
    return { status: 'skipped', reason: 'controlled_evidence_not_authorized_for_shadow_provider' }
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    return { status: 'failed', authority: false, error: 'cloudflare_shadow_credentials_missing' }
  }

  const model = CLOUDFLARE_SHADOW_MODELS[selectedModel()]
  try {
    const shadowRequest: AiRankingRequest = {
      ...request,
      systemPrompt:
        `${request.systemPrompt}\n\nSHADOW OUTPUT FORMAT\n` +
        'Return JSON only with exactly: {"rank":"high|medium|low","rationale":"...","confidence":0.0}.',
    }
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: shadowRequest.systemPrompt },
            { role: 'user', content: shadowRequest.userPrompt },
          ],
          temperature: 0,
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) throw new Error(`Cloudflare shadow request failed (${response.status})`)

    const parsed = parseShadowResponse(extractResponseText(await response.json()))
    const normalized = {
      rank: parsed.rank,
      rationale: parsed.rationale.slice(0, 2_000),
      confidence: normalizePersistedConfidence(parsed.confidence),
    }
    return {
      status: 'completed',
      authority: false,
      result: {
        ...normalized,
        provenance: {
          provider: 'cloudflare',
          model_id: model,
          prompt_version: shadowRequest.promptVersion,
          ruleset_version: shadowRequest.rulesetVersion,
          input_sha256: hashRankingInput(shadowRequest),
          output_sha256: hashRankingOutput(normalized),
          original_decision_at: new Date().toISOString(),
          presentation_rank: normalized.rank,
          cache_hit: false,
          decision_method: 'ai_ranking',
        },
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare shadow request failed'
    return { status: 'failed', authority: false, error: message.slice(0, 200) }
  }
}
