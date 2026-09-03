import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { z } from 'zod'
import { callAnthropicWithRetry } from './rate-limiter'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeForLlm, sanitizeProfileField } from '@/lib/scrapers/sanitize'
import { extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import type { ControlledEvidenceDocument } from '@/lib/controlled-evidence/profile-evidence'
import {
  ANTHROPIC_PRODUCTION_MODEL,
  ANTHROPIC_PROVIDER_ID,
  clampConfidence,
  computeInputSha256,
  computeOutputSha256,
  normalizePersistedConfidence,
  rankToReviewDecision,
  type AiDecisionProvenance,
  type AiPresentationRank,
  type AiRankingProvider,
  type AiRankingRequest,
  type AiRankingResult,
} from '@/lib/ai/provider'
import {
  PMS_CLASSIFICATION_RULESET_VERSION,
  PMS_CLASSIFICATION_SYSTEM_PROMPT,
} from '@/lib/regulatory/pms-classification-rules'

// ── Models ────────────────────────────────────────────────────────────────────

export const PRODUCTION_FILTER_PROVIDER = ANTHROPIC_PROVIDER_ID
export const PRODUCTION_FILTER_MODEL = ANTHROPIC_PRODUCTION_MODEL

// Salted into the profile fingerprint so cached decisions are keyed to the
// prompt/pipeline generation that produced them. Bump on any change to the
// system prompt, pre-filter behaviour, or decision criteria — otherwise
// improved prompts never reach the ~80% of decisions served from cache.
export const FILTER_PROMPT_VERSION = `fp-v4-ranker:${PMS_CLASSIFICATION_RULESET_VERSION}`

// ── Module-level singleton — avoids re-initialising HTTP client per call ──────

// Retry only through rate-limiter.ts. The SDK otherwise retries a terminal
// billing/authentication response before the run-level circuit breaker sees it.
const anthropic = new Anthropic({ maxRetries: 0 })

// ── Credit exhaustion guard ───────────────────────────────────────────────────
// Set on first credit exhaustion error; prevents cascade spend within a process.
// Resets on process restart (workers are ephemeral).

let creditExhausted = false
let creditExhaustedAt = 0
const CREDIT_RETRY_MS = 10 * 60 * 1000 // 10 minutes

function isAuthError(err: unknown): boolean {
  return err instanceof Anthropic.AuthenticationError
}

function isCreditExhaustionError(err: unknown): boolean {
  if (err instanceof Anthropic.PermissionDeniedError) return true
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) return true
    const msg = String(err.message).toLowerCase()
    if (msg.includes('credit balance') || msg.includes('insufficient_quota') || msg.includes('billing')) return true
    // Anthropic returns HTTP 400 for credit exhaustion — detect by status + message
    if (err.status === 400 && (msg.includes('credit') || msg.includes('quota') || msg.includes('payment'))) return true
  }
  return false
}

function sanitizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/org-[a-zA-Z0-9_-]+/g, '[REDACTED_ORG]')
    .replace(/https?:\/\/[^\s"']+/g, '[URL_REDACTED]')
    .slice(0, 200)
}

function markCreditExhausted(err: unknown): void {
  creditExhausted = true
  creditExhaustedAt = Date.now()
  console.error('[filter] AI service credit/billing exhausted — all subsequent AI calls will skip for up to 10 min:',
    sanitizeApiError(err))
}

function markAuthFailed(err: unknown): void {
  creditExhausted = true
  creditExhaustedAt = Date.now()
  console.error('[filter] AI service authentication failed (401) — all subsequent AI calls will skip for up to 10 min:',
    sanitizeApiError(err))
}

// ── PII sanitisation — strip personal data before sending to third-party AI ──

const PII_PATTERNS: [RegExp, string][] = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'],
  // Separators between digit groups are REQUIRED. Optional separators made this
  // pattern swallow lot numbers, catalog numbers, and GTIN-14 UDIs — destroying
  // the device-identity evidence the classifier needs. Trade-off: unseparated
  // phone formats (e.g. "+49 30 12345678") are no longer caught.
  [/(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]\d{3,4}\b/g, '[PHONE]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  [/\b(?:Patient|Reported\s+by|Contact|Name|Complainant)\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/gi, '[PII_REDACTED]'],
  [/\b(?:DOB|Date\s+of\s+Birth)\s*:\s*\S+/gi, '[DOB_REDACTED]'],
  [/\b(?:MRN|Medical\s+Record\s+Number|Patient\s+ID)\s*:\s*\S+/gi, '[ID_REDACTED]'],
  [/\d{2,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Pkwy|Hwy)\.?(?:\s*,|\s*$)/gi, '[ADDRESS]'],
]

export function sanitizePii(text: string): string {
  let result = text
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// Only FDA MAUDE narratives carry third-party patient data. EU regulator
// content (BfArM/MHRA/Swissmedic) is published PII-free — scrubbing it only
// risks mangling device identifiers.
export function piiScrubForSource(text: string, sourceDb?: string | null): string {
  return sourceDb === 'fda' ? sanitizePii(text) : text
}

// Versioned and independently testable regulatory context. The prompt is kept
// outside the provider integration so legal corrections cannot be hidden inside
// request plumbing.
export const SYSTEM_PROMPT = PMS_CLASSIFICATION_SYSTEM_PROMPT

// ── Schemas ───────────────────────────────────────────────────────────────────

const RankingResultSchema = z.object({
  rank:       z.enum(['high', 'medium', 'low']),
  rationale:  z.string().optional().default('').transform(s => s.slice(0, 2000)),
  confidence: z.number().min(0).max(1).optional().default(0.5),
})

// ── Public types ──────────────────────────────────────────────────────────────

export type FilterDecision = {
  decision:   'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale:  string
  confidence: number | null
  model:      string | null
  error?:     string
  provider?: string | null
  model_id?: string | null
  prompt_version?: string | null
  ruleset_version?: string | null
  input_sha256?: string | null
  output_sha256?: string | null
  original_decision_at?: string | null
  presentation_rank?: AiPresentationRank | null
  cache_hit?: boolean
  decision_method?: AiDecisionProvenance['decision_method']
}

export interface ProfileContext {
  device_name:   string
  manufacturer:  string
  intended_use:  string | null
  emdn_code:     string | null
  device_class:  string | null
  controlled_evidence?: ControlledEvidenceDocument[]
  controlled_evidence_status?: 'not_configured' | 'loaded' | 'unavailable'
}

export interface FsnContext {
  title:        string
  manufacturer: string
  raw_content:  string
  fsn_date:     string | null
  source_db?:   string | null
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

export function getProfileFingerprint(
  profile: ProfileContext,
  promptVersion: string = FILTER_PROMPT_VERSION,
  provider: string = PRODUCTION_FILTER_PROVIDER,
  modelId: string = PRODUCTION_FILTER_MODEL,
): string {
  const controlledEvidence = [...(profile.controlled_evidence ?? [])]
    .map((document) => ({
      kind: document.kind,
      label: document.label,
      content_sha256: document.content_sha256,
      extractor_version: document.extractor_version,
      included_char_count: document.included_char_count,
      truncated: document.truncated,
    }))
    .sort((a, b) => `${a.kind}:${a.label}:${a.content_sha256}`.localeCompare(`${b.kind}:${b.label}:${b.content_sha256}`))

  return createHash('sha256')
    .update(JSON.stringify({
      device_name:    profile.device_name.toLowerCase().trim(),
      classification: profile.device_class,
      manufacturer:   profile.manufacturer.toLowerCase().trim(),
      emdn_code:      profile.emdn_code ?? '',
      intended_use:   (profile.intended_use ?? '').toLowerCase().trim(),
      controlled_evidence_status: profile.controlled_evidence_status ?? 'not_configured',
      controlled_evidence: controlledEvidence,
      provider,
      model_id: modelId,
      prompt_version: promptVersion,
    }))
    .digest('hex')
    .slice(0, 32)
}

export function buildProfileContextBlock(profile: ProfileContext): string {
  const profileLines = [
    `Device: ${sanitizeProfileField(profile.device_name, 200)}`,
    `Manufacturer: ${sanitizeProfileField(profile.manufacturer, 200)}`,
    profile.emdn_code ? `EMDN Code: ${sanitizeProfileField(profile.emdn_code, 50)}` : null,
    profile.device_class ? `Device Class: ${sanitizeProfileField(profile.device_class, 50)}` : null,
    profile.intended_use
      ? `Intended Use: ${sanitizeProfileField(sanitizePii(profile.intended_use), 2_000)}`
      : null,
  ].filter(Boolean)

  const evidenceBlocks = (profile.controlled_evidence ?? []).map((document) => {
    const label = sanitizeProfileField(document.label, 160)
    const hash = /^[a-f0-9]{64}$/i.test(document.content_sha256)
      ? document.content_sha256.toLowerCase()
      : 'invalid-hash'
    const text = sanitizeForLlm(sanitizePii(document.text), document.included_char_count)
    return [
      '<CONTROLLED_PRODUCT_EVIDENCE>',
      `Document: ${label}`,
      `Evidence kind: ${document.kind}`,
      `Content SHA-256: ${hash}`,
      `Extractor: ${sanitizeProfileField(document.extractor_version, 100)}`,
      `Bounded extract: ${document.included_char_count}/${document.original_char_count} characters${document.truncated ? ' (truncated)' : ''}`,
      `Text: ${text}`,
      '</CONTROLLED_PRODUCT_EVIDENCE>',
    ].join('\n')
  })

  if (evidenceBlocks.length > 0) {
    profileLines.push('', 'Controlled product evidence with provenance:', ...evidenceBlocks)
  }
  return profileLines.join('\n')
}

// Content-aware cache key: an amended FSN (same title, changed content) MUST
// produce a different key, or the stale decision is served forever.
export function getFsnExternalId(fsn: FsnContext): string {
  const key = [fsn.title, fsn.manufacturer ?? '', fsn.source_db ?? ''].join('|').toLowerCase().trim()
  const contentHash = createHash('sha256').update(fsn.raw_content ?? '').digest('hex').slice(0, 16)
  return createHash('sha256')
    .update(`${key}|${contentHash}`)
    .digest('hex')
    .slice(0, 32)
}

// Retained identity helper for deterministic callers and regression tests.
// AI no longer uses this signal to exclude or discard records.
export function hasManufacturerTokenMatch(fsn: FsnContext, profile: ProfileContext): boolean {
  const tokens = extractManufacturerTerms(profile.manufacturer)
  if (tokens.length === 0) return false
  const hay = `${fsn.title} ${fsn.manufacturer ?? ''} ${(fsn.raw_content ?? '').slice(0, 500)}`.toLowerCase()
  return tokens.some(token => hay.includes(token))
}

async function getCachedDecision(
  fsnId: string,
  fingerprint: string,
  request: AiRankingRequest,
): Promise<FilterDecision | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('filter_decision_cache')
      .select('decision, reasoning, confidence, provider, model_id, prompt_version, ruleset_version, input_sha256, output_sha256, original_decision_at, presentation_rank')
      .eq('fsn_external_id', fsnId)
      .eq('profile_fingerprint', fingerprint)
      .single()

    if (error || !data) return null

    const rank = data.presentation_rank as AiPresentationRank | null
    const confidence = data.confidence != null ? Number(data.confidence) : null
    const expectedInputHash = computeInputSha256(request)
    if (
      data.decision === 'excluded' ||
      !rank || !['high', 'medium', 'low'].includes(rank) ||
      confidence == null || !Number.isFinite(confidence) ||
      data.provider !== PRODUCTION_FILTER_PROVIDER ||
      data.model_id !== PRODUCTION_FILTER_MODEL ||
      data.prompt_version !== request.promptVersion ||
      data.ruleset_version !== request.rulesetVersion ||
      data.input_sha256 !== expectedInputHash ||
      !data.original_decision_at
    ) return null

    const normalizedConfidence = clampConfidence(confidence > 1 ? confidence / 100 : confidence)
    const expectedOutputHash = computeOutputSha256({
      rank,
      rationale: data.reasoning ?? '',
      confidence: normalizedConfidence,
    })
    if (data.output_sha256 !== expectedOutputHash) return null

    const decision = rankToReviewDecision(rank)
    return {
      decision,
      rationale:  data.reasoning ?? '',
      confidence: normalizedConfidence,
      model: data.model_id,
      provider: data.provider,
      model_id: data.model_id,
      prompt_version: data.prompt_version,
      ruleset_version: data.ruleset_version,
      input_sha256: data.input_sha256,
      output_sha256: data.output_sha256,
      original_decision_at: data.original_decision_at,
      presentation_rank: rank,
      cache_hit: true,
      decision_method: 'ai_ranking',
    }
  } catch {
    return null  // cache miss on any error — fall through to AI
  }
}

async function setCachedDecision(
  fsnId: string,
  fingerprint: string,
  decision: FilterDecision,
): Promise<void> {
  if (decision.decision === 'excluded' || decision.decision === 'filter_failed') return
  try {
    const admin = createAdminClient()
    await admin.from('filter_decision_cache').upsert(
      {
        fsn_external_id:     fsnId,
        profile_fingerprint: fingerprint,
        decision:  decision.decision,
        reasoning: decision.rationale,
        confidence: decision.confidence != null
          ? String(Math.round(decision.confidence * 100))
          : null,
        provider: decision.provider,
        model_id: decision.model_id,
        prompt_version: decision.prompt_version,
        ruleset_version: decision.ruleset_version,
        input_sha256: decision.input_sha256,
        output_sha256: decision.output_sha256,
        original_decision_at: decision.original_decision_at,
        presentation_rank: decision.presentation_rank,
      },
      { onConflict: 'fsn_external_id,profile_fingerprint' },
    )
  } catch {
    // cache write failure is non-fatal
  }
}

// ── Provider-neutral rank request ─────────────────────────────────────────────

export function buildRankingRequest(fsn: FsnContext, profile: ProfileContext): AiRankingRequest {
  const profileBlock = buildProfileContextBlock(profile)

  // 8,000 chars: MAUDE narratives and enriched BfArM detail text routinely
  // exceed 2k, and device-identification evidence often sits past that point.
  // The full-context ranker sees this bounded extract for every residual item.
  const MAX_FSN_CONTENT_CHARS = 8000
  const originalContentLength = fsn.raw_content.length
  const wasTruncated = originalContentLength > MAX_FSN_CONTENT_CHARS
  const content = piiScrubForSource(fsn.raw_content.slice(0, MAX_FSN_CONTENT_CHARS), fsn.source_db)
  const systemPrompt = `${SYSTEM_PROMPT}\n\nRANK-ONLY SAFETY BOUNDARY\nYou do not have authority to exclude or discard a record. Return only a presentation rank: high, medium, or low. High means the evidence supports likely relevance. Medium means plausible or materially uncertain. Low means weak apparent relevance, but the record remains retained and reviewable.`
  const userPrompt =
    `Product Profile:\n${profileBlock}\n\n` +
    `<FSN_DATA>\n` +
    `Title: ${sanitizeForLlm(piiScrubForSource(fsn.title, fsn.source_db), 500)}\n` +
    `Manufacturer: ${sanitizeForLlm(piiScrubForSource(fsn.manufacturer || 'Unknown', fsn.source_db), 200)}\n` +
    `Date: ${sanitizeForLlm(fsn.fsn_date || 'Unknown', 30)}\n` +
    `Content: ${sanitizeForLlm(content, MAX_FSN_CONTENT_CHARS)}\n` +
    `</FSN_DATA>` +
    (wasTruncated
      ? `\n\nContent truncation: ${originalContentLength} to ${MAX_FSN_CONTENT_CHARS} characters.`
      : '')

  return {
    systemPrompt,
    userPrompt,
    promptVersion: FILTER_PROMPT_VERSION,
    rulesetVersion: PMS_CLASSIFICATION_RULESET_VERSION,
    containsControlledEvidence: (profile.controlled_evidence?.length ?? 0) > 0,
  }
}

const anthropicRankingProvider: AiRankingProvider = {
  id: ANTHROPIC_PROVIDER_ID,
  model: ANTHROPIC_PRODUCTION_MODEL,
  async rank(request: AiRankingRequest): Promise<AiRankingResult> {
    const parsed = await callAnthropicWithRetry(async () => {
      const response = await anthropic.messages.create({
        model: ANTHROPIC_PRODUCTION_MODEL,
        max_tokens: 512,
        system: [
          {
            type: 'text',
            text: request.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            name: 'record_ranking',
            description: 'Record the non-excluding presentation rank for this safety record.',
            input_schema: {
              type: 'object' as const,
              properties: {
                rank: { type: 'string', enum: ['high', 'medium', 'low'] },
                rationale: {
                  type: 'string',
                  description:
                    'Explain the rank. Begin: "FSN manufacturer: [X]. Profile manufacturer: [Y]." Then explain the entity and device/technology relationship.',
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['rank', 'rationale', 'confidence'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'record_ranking' },
        messages: [{ role: 'user', content: request.userPrompt }],
      })

      const toolUse = response.content.find((block) => block.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('Model did not return a ranking tool use block')
      }
      return RankingResultSchema.parse(toolUse.input)
    })

    const normalized = {
      rank: parsed.rank,
      rationale: parsed.rationale,
      confidence: normalizePersistedConfidence(parsed.confidence),
    }
    return {
      ...normalized,
      provenance: {
        provider: ANTHROPIC_PROVIDER_ID,
        model_id: ANTHROPIC_PRODUCTION_MODEL,
        prompt_version: request.promptVersion,
        ruleset_version: request.rulesetVersion,
        input_sha256: computeInputSha256(request),
        output_sha256: computeOutputSha256(normalized),
        original_decision_at: new Date().toISOString(),
        presentation_rank: normalized.rank,
        cache_hit: false,
        decision_method: 'ai_ranking',
      },
    }
  },
}

// ── Production provider ranker ────────────────────────────────────────────────

async function productionFullRank(
  request: AiRankingRequest,
): Promise<FilterDecision> {
  const ranked = await anthropicRankingProvider.rank(request)

  return {
    decision: rankToReviewDecision(ranked.rank),
    rationale: ranked.rationale,
    confidence: ranked.confidence,
    model: ranked.provenance.model_id,
    ...ranked.provenance,
  }
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

/**
 * Non-excluding safety-record ranker:
 *   1. Check decision cache — skip AI entirely if already seen
 *   2. Anthropic Sonnet assigns a high/medium/low presentation rank
 *   3. Map high to relevant and medium/low to uncertain
 *   4. Write the retained, reviewable result to cache
 *
 * AI never returns `excluded`; only independently auditable deterministic rules
 * outside this module may create an exclusion decision.
 *
 * Returns `filter_failed` when the API is unavailable after all retries.
 * Callers must surface this so users can manually review.
 */
export async function stage1Filter(
  fsn: FsnContext,
  profile: ProfileContext,
  options?: { skipCache?: boolean },
): Promise<FilterDecision> {
  if (profile.controlled_evidence_status === 'unavailable') {
    return {
      decision: 'filter_failed',
      rationale: 'Referenced controlled product evidence was unavailable or could not be extracted. No AI relevance classification was applied; manual PRRC review is required.',
      confidence: null,
      model: null,
      error: 'controlled_evidence_unavailable',
    }
  }

  // ── 0. Credit guard — fast path, no API call ─────────────────────────────
  // TTL-based reset: retry after 10 minutes in case credits were topped up
  if (creditExhausted && Date.now() - creditExhaustedAt > CREDIT_RETRY_MS) {
    creditExhausted = false
  }
  if (creditExhausted) {
    return {
      decision:   'filter_failed',
      rationale:  'Anthropic credit exhausted — manual review required.',
      confidence: null,
      model:      null,
      error:      'credit_exhausted',
    }
  }

  const fsnId      = getFsnExternalId(fsn)
  const fingerprint = getProfileFingerprint(profile)
  const request = buildRankingRequest(fsn, profile)

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
  const cached = options?.skipCache ? null : await getCachedDecision(fsnId, fingerprint, request)
  if (cached) {
    return cached
  }

  try {
    // ── 2. Full-context production ranking ────────────────────────────────
    const decision = await productionFullRank(request)

    // ── 3. Write retained result to cache ─────────────────────────────────
    await setCachedDecision(fsnId, fingerprint, decision)

    return decision
  } catch (err) {
    if (isAuthError(err)) markAuthFailed(err)
    else if (isCreditExhaustionError(err)) markCreditExhausted(err)
    const errMsg = sanitizeApiError(err)
    console.error('[stage1Filter] Failed after retries:', errMsg)
    return {
      decision:   'filter_failed',
      rationale:  'AI filter could not be applied due to API error. This item requires manual review.',
      confidence: null,
      model:      null,
      error:      errMsg,
    }
  }
}
