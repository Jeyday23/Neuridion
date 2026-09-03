import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/073_accuracy_safety_provenance.sql'),
  'utf8',
)

describe('accuracy provenance migration contract', () => {
  it('records complete decision and cache provenance', () => {
    for (const column of [
      'provider', 'model_id', 'prompt_version', 'ruleset_version', 'input_sha256',
      'output_sha256', 'original_decision_at', 'presentation_rank', 'cache_hit',
      'decision_method', 'deterministic_reason_codes', 'deterministic_evidence',
    ]) expect(sql).toContain(column)
    expect(sql).toContain('ALTER TABLE public.filter_decision_cache')
    expect(sql).toContain('filter_decision_cache_provenance_idx')
  })

  it('freezes and validates all three sampling populations', () => {
    expect(sql).toContain("sample_source IN ('model_presentation', 'deterministic', 'human')")
    expect(sql).toContain("linked_decision.presentation_rank IS DISTINCT FROM 'low'")
    expect(sql).toContain("linked_decision.decision_method IS DISTINCT FROM 'deterministic_scope'")
    expect(sql).toContain("final_event.disposition = 'excluded'")
    expect(sql).toContain('NOT EXISTS (')
    expect(sql).toContain('successor.supersedes_event_id = final_event.id')
  })
})
