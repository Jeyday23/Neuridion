import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const MODEL = 'claude-sonnet-4-6'

const client = new Anthropic()

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

export type FilterDecision = z.infer<typeof FilterDecisionSchema> & {
  model: string
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
 * On any error or unexpected response, returns `uncertain` — we never
 * silently exclude an item the model failed to evaluate.
 */
export async function stage1Filter(
  fsn: FsnContext,
  profile: ProfileContext,
): Promise<FilterDecision> {
  try {
    const profileLines = [
      `Device: ${profile.device_name}`,
      `Manufacturer: ${profile.manufacturer}`,
      profile.emdn_code ? `EMDN Code: ${profile.emdn_code}` : null,
      profile.device_class ? `Device Class: ${profile.device_class}` : null,
      profile.intended_use ? `Intended Use: ${profile.intended_use}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    // Truncate raw content to stay well within context limits
    const content = fsn.raw_content.slice(0, 2000)

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 512,
      system: `You are a medical device post-market surveillance (PMS) specialist assessing whether a Field Safety Notice (FSN) or recall notice is relevant to a specific product profile.

Respond only with the JSON schema requested.

Decision criteria:
- "relevant"  — The FSN clearly concerns the same device type, manufacturer, technology, or a substantially similar device that could affect PMS obligations.
- "uncertain" — Ambiguous: similar device category, overlapping indications, or insufficient information to decide confidently.
- "excluded"  — The FSN clearly concerns an unrelated product or manufacturer with no plausible PMS relevance.

Confidence is a float 0.0–1.0 reflecting how sure you are of the decision.`,
      messages: [
        {
          role: 'user',
          content: `Product Profile:\n${profileLines}\n\nFSN Notice:\nTitle: ${fsn.title}\nManufacturer: ${fsn.manufacturer || 'Unknown'}\nDate: ${fsn.fsn_date || 'Unknown'}\nContent: ${content}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(FilterDecisionSchema),
      },
    })

    const parsed = response.parsed_output
    if (!parsed) {
      throw new Error('Structured output parse returned null')
    }

    return {
      decision: parsed.decision,
      rationale: parsed.rationale,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      model: MODEL,
    }
  } catch {
    // On any error, return uncertain — never silently exclude
    return {
      decision: 'uncertain',
      rationale: 'AI filter could not be applied — manual review required.',
      confidence: 0,
      model: MODEL,
    }
  }
}
