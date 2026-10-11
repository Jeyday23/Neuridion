import type { AdjudicationEvent, AdjudicationFilterDecision } from '@/lib/adjudication/types'
import { currentFinalEvent, latestDecisionByResult, latestSecondReview } from '@/lib/adjudication/policy'

/**
 * Effective decision per screened record, using the same precedence as
 * lib/reports/effective-decisions.ts: the current final human disposition
 * wins when it covers the current automated assessment; otherwise the latest
 * automated assessment stands. Unlike the report builder this never throws:
 * a comparison must still render for draft runs, so incomplete human review
 * is reported through `human_state` instead.
 */

export type DecisionOrigin = 'human' | 'ai' | 'none'

/**
 * - complete: final disposition covers the current AI decision and any
 *   required independent second review agrees.
 * - pending_second_review: final disposition recorded, required second review
 *   not yet in agreement. The disposition is shown but is not settled.
 * - stale: a final disposition exists but covers an older AI decision; the
 *   current AI decision is used instead.
 */
export type HumanReviewState = 'complete' | 'pending_second_review' | 'stale'

export interface EffectiveDecision {
  decision: string | null
  origin: DecisionOrigin
  human_state: HumanReviewState | null
}

export interface DecisionInput {
  id: string
  fsn_result_id: string
  /** FilterVerdict as stored; kept as string so unknown values pass through verbatim. */
  decision: string
  decided_at: string
}

export function effectiveDecisionsByResult(
  resultIds: string[],
  decisions: DecisionInput[],
  events: AdjudicationEvent[],
): Map<string, EffectiveDecision> {
  // latestDecisionByResult only reads id, fsn_result_id and decided_at; the
  // returned rows are the same objects passed in.
  const machineByResult = latestDecisionByResult(decisions as unknown as AdjudicationFilterDecision[]) as unknown as Map<string, DecisionInput>
  const eventsByResult = new Map<string, AdjudicationEvent[]>()
  for (const event of events) {
    const list = eventsByResult.get(event.fsn_result_id)
    if (list) list.push(event)
    else eventsByResult.set(event.fsn_result_id, [event])
  }

  const out = new Map<string, EffectiveDecision>()
  for (const id of resultIds) {
    const machine = machineByResult.get(id)
    const recordEvents = eventsByResult.get(id) ?? []
    const final = currentFinalEvent(recordEvents)
    if (final && machine && final.filter_decision_id === machine.id) {
      const pending = final.requires_second_review
        && latestSecondReview(recordEvents, final)?.disposition !== final.disposition
      out.set(id, {
        decision: final.disposition,
        origin: 'human',
        human_state: pending ? 'pending_second_review' : 'complete',
      })
      continue
    }
    out.set(id, {
      decision: machine?.decision ?? null,
      origin: machine ? 'ai' : 'none',
      human_state: final ? 'stale' : null,
    })
  }
  return out
}
