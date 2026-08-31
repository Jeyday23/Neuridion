import type {
  AdjudicationEvent,
  AdjudicationFilterDecision,
  AdjudicationRecordState,
  AdjudicationResultRecord,
  HumanDisposition,
  PublicAdjudicationEvent,
  ReviewRequirement,
} from './types'

const SERIOUS_EVENT_TERMS = [
  /\bdeath\b/i,
  /\bdied\b/i,
  /\bfatal(?:ity)?\b/i,
  /\blife[- ]threatening\b/i,
  /\bserious injur(?:y|ies)\b/i,
  /\bhospitali[sz](?:ation|ed)\b/i,
  /\bfield safety corrective action\b/i,
  /\bFSCA\b/,
  /\brecall\b/i,
]

export function publicEvent(event: AdjudicationEvent | null): PublicAdjudicationEvent | null {
  if (!event) return null
  return {
    id: event.id,
    phase: event.phase,
    disposition: event.disposition,
    confidence: event.confidence,
    rationale: event.rationale,
    reviewer_id: event.reviewer_id,
    reviewer_role: event.reviewer_role,
    qualification_attestation: event.qualification_attestation,
    blind_to_ai: event.blind_to_ai,
    requires_second_review: event.requires_second_review,
    material_change: event.material_change,
    serious_event_signal: event.serious_event_signal,
    created_at: event.created_at,
  }
}

export function latestDecisionByResult(
  decisions: AdjudicationFilterDecision[],
): Map<string, AdjudicationFilterDecision> {
  const latest = new Map<string, AdjudicationFilterDecision>()
  for (const decision of decisions) {
    const current = latest.get(decision.fsn_result_id)
    if (!current || decision.decided_at >= current.decided_at) {
      latest.set(decision.fsn_result_id, decision)
    }
  }
  return latest
}

export function currentFinalEvent(events: AdjudicationEvent[]): AdjudicationEvent | null {
  const superseded = new Set(
    events.flatMap((event) => event.supersedes_event_id ? [event.supersedes_event_id] : []),
  )
  return [...events]
    .reverse()
    .find((event) => event.phase === 'final' && !superseded.has(event.id)) ?? null
}

export function latestSecondReview(
  events: AdjudicationEvent[],
  finalEvent: AdjudicationEvent | null,
): AdjudicationEvent | null {
  if (!finalEvent) return null
  return [...events]
    .reverse()
    .find((event) => event.phase === 'second_review'
      && event.review_of_event_id === finalEvent.id
      && event.reviewer_id !== finalEvent.reviewer_id) ?? null
}

export function isSeriousEventText(title: string, rawContent?: string | null): boolean {
  const evidence = `${title}\n${rawContent ?? ''}`
  return SERIOUS_EVENT_TERMS.some((term) => term.test(evidence))
}

export function assessFinalDecision(input: {
  aiDisposition: string
  provisionalDisposition?: HumanDisposition | null
  previousFinalDisposition?: HumanDisposition | null
  finalDisposition: HumanDisposition
  seriousEvent: boolean
}): { materialChange: boolean; requiresSecondReview: boolean } {
  const materialChange = input.finalDisposition === 'excluded' && (
    input.aiDisposition === 'relevant'
    || input.aiDisposition === 'uncertain'
    || input.provisionalDisposition === 'relevant'
    || input.previousFinalDisposition === 'relevant'
  )
  return {
    materialChange,
    requiresSecondReview: materialChange
      || (input.seriousEvent && input.finalDisposition === 'excluded'),
  }
}

function exposeDecision(decision: AdjudicationFilterDecision | undefined) {
  if (!decision) return null
  return {
    id: decision.id,
    decision: decision.decision,
    rationale: decision.rationale,
    confidence: decision.confidence,
    model_used: decision.model_used,
    prompt_version: decision.prompt_version,
    decided_at: decision.decided_at,
  }
}

export function buildAdjudicationRecords(input: {
  results: AdjudicationResultRecord[]
  decisions: AdjudicationFilterDecision[]
  requirements: ReviewRequirement[]
  events: AdjudicationEvent[]
  viewerId: string
  viewerCanOnlySecondReview?: boolean
}): AdjudicationRecordState[] {
  const decisionByResult = latestDecisionByResult(input.decisions)

  return input.results.map((result) => {
    const decision = decisionByResult.get(result.id)
    const explicitRequirements = input.requirements.filter((item) => item.fsn_result_id === result.id)
    const derivedReason = decision && ['relevant', 'uncertain', 'filter_failed'].includes(decision.decision)
      ? `ai_${decision.decision}`
      : null
    let reasons = [...new Set([
      ...explicitRequirements.map((item) => item.requirement_reason),
      ...(derivedReason ? [derivedReason] : []),
    ])]
    const blindRequired = explicitRequirements.some((item) => item.blind_review_required)
    const events = input.events.filter((event) => event.fsn_result_id === result.id)
    const viewerProvisional = [...events].reverse().find(
      (event) => event.phase === 'provisional_blind' && event.reviewer_id === input.viewerId,
    ) ?? null
    const finalEvent = currentFinalEvent(events)
    const secondReview = latestSecondReview(events, finalEvent)
    const aiRevealed = !blindRequired || Boolean(viewerProvisional) || Boolean(input.viewerCanOnlySecondReview)
    // A sampled-exclusion reason itself reveals the concealed AI outcome. Use
    // a neutral reason until the viewer has irrevocably submitted the blind
    // provisional decision.
    if (!aiRevealed && blindRequired) reasons = ['blind_validation']
    const complete = Boolean(finalEvent) && (
      !finalEvent?.requires_second_review
      || secondReview?.disposition === finalEvent?.disposition
    )

    const { raw_content: _rawContent, ...publicResult } = result
    void _rawContent

    return {
      fsn_result: publicResult,
      review_required: reasons.length > 0,
      requirement_reasons: reasons,
      blind_review_required: blindRequired,
      ai_revealed: aiRevealed,
      ...(aiRevealed ? { filter_decision: exposeDecision(decision) } : {}),
      provisional_blind: publicEvent(viewerProvisional),
      final: publicEvent(finalEvent),
      second_review: publicEvent(secondReview),
      complete,
    }
  })
}
