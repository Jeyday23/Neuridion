import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { z } from 'zod'
import { callAnthropicWithRetry, callHaikuWithRetry } from './rate-limiter'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Models ────────────────────────────────────────────────────────────────────

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-4-6'

// ── Module-level singleton — avoids re-initialising HTTP client per call ──────

const anthropic = new Anthropic()

// ── Credit exhaustion guard ───────────────────────────────────────────────────
// Set on first credit exhaustion error; prevents cascade spend within a process.
// Resets on process restart (workers are ephemeral).

let creditExhausted = false

function isCreditExhaustionError(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError)  return true   // 401
  if (err instanceof Anthropic.PermissionDeniedError) return true  // 403
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) return true
    const msg = String(err.message).toLowerCase()
    return msg.includes('credit balance') || msg.includes('insufficient_quota') || msg.includes('billing')
  }
  return false
}

function markCreditExhausted(err: unknown): void {
  creditExhausted = true
  console.error('[filter] Anthropic credit exhausted — all subsequent AI calls will skip:',
    err instanceof Error ? err.message : String(err))
}

// ── PII sanitisation — strip personal data before sending to third-party AI ──

const PII_PATTERNS: [RegExp, string][] = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'],
  [/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g, '[PHONE]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  [/\b(?:Patient|Reported\s+by|Contact|Name|Complainant)\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/gi, '[PII_REDACTED]'],
  [/\b(?:DOB|Date\s+of\s+Birth)\s*:\s*\S+/gi, '[DOB_REDACTED]'],
  [/\b(?:MRN|Medical\s+Record\s+Number|Patient\s+ID)\s*:\s*\S+/gi, '[ID_REDACTED]'],
  [/\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl)\b\.?/g, '[ADDRESS]'],
]

function sanitizePii(text: string): string {
  let result = text
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Target: ~1,200 tokens so the cache_control breakpoint clears the 1,024-token
// minimum required for claude-sonnet-4-6 prompt caching.
// Includes regulatory context, decision criteria, confidence rubric,
// edge-case rules, and the three few-shot examples.

const SYSTEM_PROMPT = `You are a medical device post-market surveillance (PMS) specialist. Your role is to assess whether a Field Safety Notice (FSN) or Field Safety Corrective Action (FSCA) is relevant to a specific product profile, in accordance with EU MDR 2017/745 and IVDR 2017/746.

REGULATORY CONTEXT

EU MDR 2017/745 Article 83 requires manufacturers to operate a post-market surveillance system proportionate to device risk class. Article 84 mandates a documented PMS plan. Article 85 (Class I) and Article 86 (Class IIa, IIb, III) require periodic reporting via Post-Market Surveillance Reports (PMSR) or Periodic Safety Update Reports (PSUR). FSNs published by other manufacturers are primary evidence for trend identification, proactive risk assessment, and PSUR updates — particularly where the FSN concerns a device with shared technology, clinical indication, or failure mode.

Article 87 defines reportable serious incidents. Article 88 defines Field Safety Corrective Actions. A manufacturer's PMS obligation extends to devices that are substantially equivalent in design, materials, intended purpose, or technology — not only to their own exact product line.

DECISION CRITERIA

"relevant" — The FSN concerns any of the following:
- The same device or a substantially equivalent device (same manufacturer, overlapping intended purpose, same core technology)
- A component, consumable, or accessory integral to the device's function in normal clinical use
- A device using the same primary mechanism of action (same energy source, same sensor principle, same drug-delivery pathway)
- A rebranded, OEM-supplied, or white-label version of the profiled device
- A device in the same EMDN/GMDN category where the failure mode is technology-generic

"uncertain" — The FSN concerns any of the following:
- A device in the same broad clinical domain but different technology class or intended purpose
- An accessory or peripheral with independent market distribution whose compatibility with the profiled device is plausible but unconfirmed
- A partially overlapping manufacturer name (subsidiary, acquired brand, OEM relationship possible but not confirmed)
- Insufficient FSN content to determine product overlap with confidence
- Same EMDN code, different intended purpose or patient population

"excluded" — The FSN concerns any of the following:
- A device with a completely different clinical domain, technology, or intended purpose
- A different manufacturer with no plausible technology, OEM, or subsidiary relationship
- A software-only device when the profile is hardware (or vice versa) with no combination-product relationship
- An IVD device when the profile is a therapeutic or surgical device, unless they form a combination product

CONFIDENCE SCORING

0.90–1.00  Clear manufacturer + product-name match; or same EMDN code + same mechanism of action
0.70–0.89  Same manufacturer, different product line; or same technology, different manufacturer
0.50–0.69  Same clinical domain, ambiguous technology overlap
0.30–0.49  Peripheral or accessory relationship — plausible but unconfirmed
0.10–0.29  Very weak signal; classify as uncertain with explicit reasoning

EDGE CASES

OEM / rebranded devices: If the FSN manufacturer is a known OEM supplier to the profiled device's manufacturer, classify as relevant even when product names differ.

Combination products: A drug-device combination FSN is relevant to the device component when that component matches the profiled device.

Accessories and consumables: Integral accessories (electrode pads, pump tubing, infusion sets) are relevant. Optional accessories with standalone market distribution require uncertain unless the FSN describes a failure mode that propagates to the primary device.

Platform devices: An FSN for a software module or algorithm that executes on a platform device is relevant to that platform.

EXAMPLES

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

Now assess the following FSN using the record_decision tool.`.trim()

// ── Schemas ───────────────────────────────────────────────────────────────────

const FilterDecisionSchema = z.object({
  decision:   z.enum(['relevant', 'uncertain', 'excluded']),
  rationale:  z.string().optional().default(''),
  confidence: z.number().min(0).max(1).optional().default(0.5),
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
      .select('decision, reasoning, confidence')
      .eq('fsn_external_id', fsnId)
      .eq('profile_fingerprint', fingerprint)
      .single()

    if (error || !data) return null

    return {
      decision:   data.decision as FilterDecision['decision'],
      rationale:  data.reasoning ?? '',
      confidence: data.confidence != null ? parseFloat(data.confidence) / 100 : null,
      model:      null,
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
        decision:  decision.decision,
        reasoning: decision.rationale,
        confidence: decision.confidence != null
          ? String(Math.round(decision.confidence * 100))
          : null,
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
    const response = await anthropic.messages.create({
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

  const content = sanitizePii(fsn.raw_content.slice(0, 2000))

  const parsed = await callAnthropicWithRetry(async () => {
    const response = await anthropic.messages.create({
      model:      SONNET_MODEL,
      max_tokens: 512,
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
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
          content: [
            {
              type:          'text',
              text:          `Product Profile:\n${profileLines}`,
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text:
                `FSN Notice:\n` +
                `Title: ${fsn.title}\n` +
                `Manufacturer: ${fsn.manufacturer || 'Unknown'}\n` +
                `Date: ${fsn.fsn_date || 'Unknown'}\n` +
                `Content: ${content}`,
            },
          ],
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
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
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
  // ── 0. Credit guard — fast path, no API call ─────────────────────────────
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

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
  const cached = options?.skipCache ? null : await getCachedDecision(fsnId, fingerprint)
  if (cached) {
    return cached
  }

  try {
    // ── 2. Haiku pre-filter ────────────────────────────────────────────────
    let haikuVerdict: 'CLEAR_EXCLUDE' | 'UNCERTAIN' = 'UNCERTAIN'
    try {
      haikuVerdict = await haikuPreFilter(fsn, profile)
    } catch (haikuErr) {
      if (isCreditExhaustionError(haikuErr)) {
        markCreditExhausted(haikuErr)
        throw haikuErr  // propagates to outer catch → filter_failed, stops cascade
      }
      // Transient error (rate limit, timeout, overload) — fall through to Sonnet
      console.error('[filter]', 'haiku pre-filter failed, falling back to Sonnet:', haikuErr)
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
    if (isCreditExhaustionError(err)) markCreditExhausted(err)
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
