import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { callAnthropicWithRetry } from './rate-limiter'

const MODEL = 'claude-sonnet-4-6'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FilterDecisionSchema = z.object({
  decision: z.enum(['relevant', 'uncertain', 'excluded']),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
})

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FilterDecision = {
  decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale: string
  confidence: number | null
  model: string | null
  error?: string
}

export interface ProfileContext {
  device_name: string
  manufacturer: string
  intended_use: string | null
  emdn_code: string | null
  device_class: string | null
}

export interface FsnContext {
  title: string
  manufacturer: string
  raw_content: string
  fsn_date: string | null
}

// ---------------------------------------------------------------------------
// Stage 1 filter
// ---------------------------------------------------------------------------

/**
 * Assesses whether an FSN notice is relevant to a product profile.
 *
 * Returns `filter_failed` (not `uncertain`) when the API is unavailable after
 * all retries — callers must surface this to users so they can manually review.
 */
export async function stage1Filter(
  fsn: FsnContext,
  profile: ProfileContext,
): Promise<FilterDecision> {
  const profileLines = [
    `Device: ${profile.device_name}`,
    `Manufacturer: ${profile.manufacturer}`,
    profile.emdn_code ? `EMDN Code: ${profile.emdn_code}` : null,
    profile.device_class ? `Device Class: ${profile.device_class}` : null,
    profile.intended_use ? `Intended Use: ${profile.intended_use}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const content = fsn.raw_content.slice(0, 2000)

  try {
    const parsed = await callAnthropicWithRetry(async () => {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: `You are a medical device post-market surveillance (PMS) specialist assessing whether a Field Safety Notice (FSN) or recall notice is relevant to a specific product profile.

Decision criteria:
- "relevant"  — The FSN clearly concerns the same device type, manufacturer, technology, or a substantially similar device that could affect PMS obligations.
- "uncertain" — Ambiguous: similar device category, overlapping indications, or insufficient information to decide confidently.
- "excluded"  — The FSN clearly concerns an unrelated product or manufacturer with no plausible PMS relevance.

Confidence is a float 0.0–1.0 reflecting how sure you are of the decision.`,
        tools: [
          {
            name: 'record_decision',
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
            content: `Product Profile:\n${profileLines}\n\nFSN Notice:\nTitle: ${fsn.title}\nManufacturer: ${fsn.manufacturer || 'Unknown'}\nDate: ${fsn.fsn_date || 'Unknown'}\nContent: ${content}`,
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
      model:      MODEL,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[stage1Filter] Failed after retries:', errMsg)
    return {
      decision:  'filter_failed',
      rationale: 'AI filter could not be applied due to API error. This item requires manual review.',
      confidence: null,
      model:      null,
      error:      errMsg,
    }
  }
}
