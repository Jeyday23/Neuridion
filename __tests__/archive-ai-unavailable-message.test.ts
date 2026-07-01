import { describe, expect, it } from 'vitest'
import { filterFailedExplanation } from '@/app/dashboard/archive/[id]/run-results'

describe('archive AI unavailable explanation', () => {
  it('shows provider outage details instead of claiming every unprocessed item hit the cap', () => {
    const rationale =
      'AI review unavailable because the Anthropic provider account is not currently usable. ' +
      'Raw source retrieval retained this item for PRRC manual review. ' +
      'No AI relevance classification was applied.'

    expect(filterFailedExplanation(rationale)).toBe(rationale)
    expect(filterFailedExplanation(rationale)).not.toContain('exceeded the AI filter cap')
  })

  it('keeps cap-specific explanations when the run item limit was the actual reason', () => {
    const rationale = 'Run item limit (300) reached — manual review required.'

    expect(filterFailedExplanation(rationale)).toBe(rationale)
  })

  it('falls back safely when no rationale was stored', () => {
    expect(filterFailedExplanation(null)).toBe(
      'AI assessment was unavailable for this item. Manual PRRC review is required.',
    )
  })
})
