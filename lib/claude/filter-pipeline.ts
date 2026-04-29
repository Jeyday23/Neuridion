import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { z } from 'zod'
import { callAnthropicWithRetry, callHaikuWithRetry } from './rate-limiter'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Models ────────────────────────────────────────────────────────────────────

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-4-6'

// ── Schemas ───────────────────────────────────────────────────────────────────

const FilterDecisionSchema = z.object({
  decision:   z.enum(['relevant', 'uncertain', 'excluded']),
  rationale:  z.string(),
  confidence: z.number().min(0).max(1),
})

// ── Public types ──────────────────────────────────────────────────────────────

export type FilterDecision = {
  decision:   'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale:  string
  confidence: number | null
  model:      string | null
  error?:     string
}

export interface ProfileContext {
  device_name:   string
  manufacturer:  string
  intended_use:  string | null
  emdn_code:     string | null
  device_class:  string | null
}

export interface FsnContext {
  title:        string
  manufacturer: string
  raw_content:  string
  fsn_date:     string | null
}

// ── Few-shot examples for Stage 2 (Sonnet) ───────────────────────────────────

const FEW_SHOT_EXAMPLES = `
EXAMPLE 1 — CLEARLY RELEVANT
Profile: MAGNETOM MRI Scanner, Siemens Healthineers (Class IIb)
FSN Title: "Urgent Safety Notice: MAGNETOM gradient coil overheating"
FSN Manufacturer: Siemens Healthineers
Decision: relevant
Rationale: Direct manufacturer and product-name match on primary device. The gradient coil is an integral part of the MAGNETOM system and this FSN has immediate PMS relevance.

EXAMPLE 2 — CLEARLY EXCLUDED
Profile: MAGNETOM MRI Scanner, Siemens Healthineers (Class IIb)
FSN Title: "Urgent Safety Notice: CGM CLINICAL insulin dosing app — incorrect dose calculation"
FSN Manufacturer: Roche Diagnostics
Decision: excluded
Rationale: Completely different device class (IVD software vs. imaging hardware) and entirely different clinical domain (diabetes management vs. diagnostic imaging). No plausible PMS overlap.

EXAMPLE 3 — UNCERTAIN (ADJACENT DEVICE)
Profile: MAGNETOM MRI Scanner, Siemens Healthineers (Class IIb)
FSN Title: "Resoundant Acoustic Driver System — vibration amplitude variance"
FSN Manufacturer: Resoundant Inc.
Decision: uncertain
Rationale: MRE acoustic driver hardware is routinely paired with MAGNETOM scanners in clinical MR elastography workflows. Different manufacturer, but this is a peripheral accessory to the device. Requires human review to determine PMS obligation.

---
Now assess the following FSN:
`.trim()

// ── Cache helpers ─────────────────────────────────────────────────────────────

export function getProfileFingerprint(profile: ProfileContext): string {
  return createHash('sha256')
    .update(JSON.stringify({
      device_type:    profile.device_name.toLowerCase().split(' ')[0],
      classification: profile.device_class,
      manufacturer:   profile.manufacturer.toLowerCase(),
    }))
    .digest('hex')
    .slice(0, 16)
}

function getFsnExternalId(fsn: FsnContext): string {
  return createHash('sha256')
    .update(fsn.title.toLowerCase().trim())
    .digest('hex')
    .slice(0, 32)
}

async function getCachedDecision(
  fsnId: string,
  fingerprint: string,
): Promise<FilterDecision | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('filter_decision_cache')
      .select('decision, rationale, confidence, model_used')
      .eq('fsn_external_id', fsnId)
      .eq('profile_fingerprint', fingerprint)
      .single()

    if (error || !data) return null

    return {
      decision:   data.decision as FilterDecision['decision'],
      rationale:  data.rationale ?? '',
      confidence: data.confidence != null ? data.confidence / 100 : null,
      model:      data.model_used ?? null,
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
  try {
    const admin = createAdminClient()
    await admin.from('filter_decision_cache').upsert(
      {
        fsn_external_id:     fsnId,
        profile_fingerprint: fingerprint,
        decision:            decision.decision,
        rationale:           decision.rationale,
        confidence:          decision.confidence != null
          ? Math.round(decision.confidence * 100)
          : null,
        model_used:          decision.model,
      },
      { onConflict: 'fsn_external_id,profile_fingerprint' },
    )
  } catch {
    // cache write failure is non-fatal
  }
}

// ── Stage 1 — Haiku pre-filter ────────────────────────────────────────────────
// Returns 'CLEAR_EXCLUDE' (skip Sonnet) or 'UNCERTAIN' (send to Sonnet).

async function haikuPreFilter(
  fsn: FsnContext,
  profile: ProfileContext,
): Promise<'CLEAR_EXCLUDE' | 'UNCERTAIN'> {
  const result = await callHaikuWithRetry(async () => {
    const client = new Anthropic()
    const response = await client.messages.create({
      model:      HAIKU_MODEL,
      max_tokens: 16,
      system:
        'You are a medical device PMS specialist. ' +
        'Respond with exactly one word: CLEAR_EXCLUDE or UNCERTAIN.',
      messages: [
        {
          role: 'user',
          content:
            `Device profile: ${profile.device_name} by ${profile.manufacturer}` +
            (profile.device_class ? `, ${profile.device_class}` : '') +
            `\n\nFSN: "${fsn.title}" by ${fsn.manufacturer || 'Unknown'}\n\n` +
            'Is this FSN CLEARLY NOT relevant to the device profile? ' +
            'Only say CLEAR_EXCLUDE if the device type or clinical domain is ' +
            'obviously different. Otherwise say UNCERTAIN.',
        },
      ],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()
      .toUpperCase()

    return text.includes('CLEAR_EXCLUDE') ? 'CLEAR_EXCLUDE' : 'UNCERTAIN'
  })

  return result
}

// ── Stage 2 — Sonnet full filter ──────────────────────────────────────────────

async function sonnetFullFilter(
  fsn: FsnContext,
  profile: ProfileContext,
): Promise<FilterDecision> {
  const profileLines = [
    `Device: ${profile.device_name}`,
    `Manufacturer: ${profile.manufacturer}`,
    profile.emdn_code    ? `EMDN Code: ${profile.emdn_code}`       : null,
    profile.device_class ? `Device Class: ${profile.device_class}` : null,
    profile.intended_use ? `Intended Use: ${profile.intended_use}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const content = fsn.raw_content.slice(0, 2000)

  const parsed = await callAnthropicWithRetry(async () => {
    const client = new Anthropic()
    const response = await client.messages.create({
      model:      SONNET_MODEL,
      max_tokens: 512,
      system: `You are a medical device post-market surveillance (PMS) specialist assessing whether a Field Safety Notice (FSN) or recall notice is relevant to a specific product profile.

Decision criteria:
- "relevant"  — The FSN clearly concerns the same device type, manufacturer, technology, or a substantially similar device that could affect PMS obligations.
- "uncertain" — Ambiguous: similar device category, overlapping indications, or insufficient information to decide confidently.
- "excluded"  — The FSN clearly concerns an unrelated product or manufacturer with no plausible PMS relevance.

Confidence is a float 0.0–1.0 reflecting how sure you are of the decision.`,
      tools: [
        {
          name:        'record_decision',
          description: 'Record the relevance decision for this FSN notice.',
          input_schema: {
            type: 'object' as const,
            properties: {
              decision:   { type: 'string', enum: ['relevant', 'uncertain', 'excluded'] },
              rationale:  { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['decision', 'rationale', 'confidence'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'record_decision' },
      messages: [
        {
          role: 'user',
          content:
            `${FEW_SHOT_EXAMPLES}\n\n` +
            `Product Profile:\n${profileLines}\n\n` +
            `FSN Notice:\n` +
            `Title: ${fsn.title}\n` +
            `Manufacturer: ${fsn.manufacturer || 'Unknown'}\n` +
            `Date: ${fsn.fsn_date || 'Unknown'}\n` +
            `Content: ${content}`,
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Model did not return a tool use block')
    }
    return FilterDecisionSchema.parse(toolUse.input)
  })

  return {
    decision:   parsed.decision,
    rationale:  parsed.rationale,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    model:      SONNET_MODEL,
  }
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

/**
 * Two-stage FSN filter:
 *   1. Check decision cache — skip AI entirely if already seen
 *   2. Haiku pre-filter — quick CLEAR_EXCLUDE / UNCERTAIN triage
 *   3. Sonnet full filter — only for items Haiku couldn't exclude
 *   4. Write result to cache
 *
 * Returns `filter_failed` when the API is unavailable after all retries.
 * Callers must surface this so users can manually review.
 */
export async function stage1Filter(
  fsn: FsnContext,
  profile: ProfileContext,
  options?: { skipCache?: boolean },
): Promise<FilterDecision> {
  const fsnId      = getFsnExternalId(fsn)
  const fingerprint = getProfileFingerprint(profile)

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
  const cached = options?.skipCache ? null : await getCachedDecision(fsnId, fingerprint)
  if (cached) {
    console.log(`[filter] cache hit: ${fsn.title.slice(0, 60)}`)
    return cached
  }

  try {
    // ── 2. Haiku pre-filter ────────────────────────────────────────────────
    let haikuVerdict: 'CLEAR_EXCLUDE' | 'UNCERTAIN' = 'UNCERTAIN'
    try {
      haikuVerdict = await haikuPreFilter(fsn, profile)
    } catch (haikuErr) {
      // Haiku failure is non-fatal — fall through to Sonnet
      console.warn('[filter] haiku pre-filter failed, falling back to Sonnet:', haikuErr)
    }

    let decision: FilterDecision

    if (haikuVerdict === 'CLEAR_EXCLUDE') {
      // ── 3a. Haiku excluded — skip Sonnet ──────────────────────────────
      decision = {
        decision:   'excluded',
        rationale:  'Excluded by Haiku pre-filter: device type or clinical domain clearly different.',
        confidence: 0.85,
        model:      HAIKU_MODEL,
      }
    } else {
      // ── 3b. Uncertain — send to Sonnet ────────────────────────────────
      decision = await sonnetFullFilter(fsn, profile)
    }

    // ── 4. Write to cache ────────────────────────────────────────────────
    if (decision.decision !== 'filter_failed') {
      await setCachedDecision(fsnId, fingerprint, decision)
    }

    return decision
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
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
