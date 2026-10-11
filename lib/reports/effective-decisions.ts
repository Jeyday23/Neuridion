import type { AdjudicationEvent, AdjudicationFilterDecision } from '@/lib/adjudication/types'
import { currentFinalEvent, latestSecondReview } from '@/lib/adjudication/policy'
import type { FsnReportRow } from '@/lib/domain/types'

/** Stable ordering even when a batch shares the same database timestamp. */
export function buildReportRows(
  results: Omit<FsnReportRow, 'filter_decision'>[],
  decisions: AdjudicationFilterDecision[],
  events: AdjudicationEvent[],
): FsnReportRow[] {
  const orderedDecisions = [...decisions].sort((a, b) => a.decided_at.localeCompare(b.decided_at) || a.id.localeCompare(b.id))
  const orderedEvents = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  return results.map((result) => {
    const history = orderedDecisions.filter((decision) => decision.fsn_result_id === result.id)
    const machine = history.at(-1)
    const recordEvents = orderedEvents.filter((event) => event.fsn_result_id === result.id)
    const final = currentFinalEvent(recordEvents)
    if (final && (!machine || final.filter_decision_id !== machine.id)) {
      throw new Error('Final disposition does not cover the current assessment')
    }
    if (final?.requires_second_review && latestSecondReview(recordEvents, final)?.disposition !== final.disposition) {
      throw new Error('Independent review is incomplete')
    }
    if (!final && (!machine || machine.decision !== 'excluded')) {
      throw new Error('A required final human disposition is missing')
    }
    return {
      ...result,
      filter_decision: final
        ? { decision: final.disposition, rationale: final.rationale, confidence: null }
        : machine ? { decision: machine.decision, rationale: machine.rationale, confidence: machine.confidence } : null,
      decision_origin: final ? 'human' : 'automated',
      ...(final ? { human_review: { event_id: final.id, reviewer_id: final.reviewer_id, reviewed_at: final.created_at, confidence: final.confidence } } : {}),
      ai_history: history.map(({ id, decision, rationale, confidence, model_used, decided_at }) => ({ id, decision, rationale, confidence, model_used, decided_at })),
    }
  })
}
