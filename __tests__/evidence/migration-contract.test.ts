import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/068_regulatory_evidence_foundation.sql'),
  'utf8',
)

describe('evidence migration contract', () => {
  it('keeps authority records separate from real-world safety actions', () => {
    expect(sql).toContain('CREATE TABLE public.regulatory_safety_actions')
    expect(sql).toContain('CREATE TABLE public.safety_action_match_assertions')
  })

  it('does not claim that a database flag deletes storage bytes', () => {
    expect(sql).not.toContain('allow_redaction')
    expect(sql).not.toContain('redact_evidence(')
    expect(sql).toContain('redaction_completed')
  })

  it('enforces append-only evidence without later updating observations', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.prevent_evidence_mutation()')
    expect(sql).not.toMatch(/UPDATE\s+public\.fsn_observations/i)
  })
})

