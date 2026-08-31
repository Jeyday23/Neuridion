import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/072_sampling_and_production_canaries.sql'),
  'utf8',
)
const adjudicationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/071_human_adjudication.sql'),
  'utf8',
)

describe('sampling and production canary migration contract', () => {
  it('pre-registers and persists the 15% blind-first arm for surfaced records', () => {
    expect(adjudicationSql).toContain("'blind-first-v1'")
    expect(adjudicationSql).toContain('blind_policy_version')
    expect(adjudicationSql).toContain('blind_inclusion_probability')
    expect(adjudicationSql).toContain('THEN 0.15 ELSE NULL')
  })

  it('stores sampling probability and the policy/draw provenance immutably', () => {
    expect(sql).toContain('CREATE TABLE public.exclusion_review_samples')
    expect(sql).toContain('inclusion_probability')
    expect(sql).toContain('policy_version')
    expect(sql).toContain('policy_snapshot')
    expect(sql).toContain('draw_identifier')
    expect(sql).toContain('seed_hash')
    expect(sql).toContain('trg_exclusion_review_samples_append_only')
  })

  it('turns every sampled exclusion into an approval-blocking requirement', () => {
    expect(sql).toContain("'sampled_exclusion'")
    expect(sql).toContain('INSERT INTO public.review_requirements')
    expect(sql).toContain('blind_policy_version, blind_inclusion_probability')
    expect(sql).toContain('trg_exclusion_review_samples_requirement')
  })

  it('derives canary scope from a service-role-only synthetic profile', () => {
    expect(sql).toContain('derive_search_run_canary_scope')
    expect(sql).toContain('is_synthetic_canary = false')
    expect(sql).toContain('neuridion-canary-')
    expect(sql).toContain('canary_execution_id')
  })

  it('blocks synthetic records at RLS and report-output boundaries', () => {
    expect(sql).toContain('sr.is_synthetic_canary = false')
    expect(sql).toContain('prevent_canary_report_output')
    expect(sql).toContain('prevent_canary_report_paths')
    expect(sql).toContain('Synthetic canary runs cannot produce customer reports')
  })
})
