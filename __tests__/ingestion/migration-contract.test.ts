import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/069_scheduled_ingestion_observability.sql'),
  'utf8',
)

describe('scheduled ingestion migration contract', () => {
  it('excludes FDA and EUDAMED from scheduled source rows', () => {
    const sourceConstraint = sql.match(/source\s+text NOT NULL CHECK \(source IN \(([^)]+)\)\)/)?.[1] ?? ''
    expect(sourceConstraint).toContain("'bfarm'")
    expect(sourceConstraint).not.toContain("'fda'")
    expect(sourceConstraint).not.toContain("'eudamed'")
  })

  it('uses expiring leases and bounded retry claims', () => {
    expect(sql).toContain("lease_expires_at")
    expect(sql).toContain('attempt_count < 3')
    expect(sql).toContain("interval '15 minutes'")
  })

  it('does not replace coverage with a delete-and-reinsert workflow', () => {
    expect(sql).not.toMatch(/DELETE FROM public\.sync_coverage/i)
  })

  it('keeps infrastructure tables service-role only', () => {
    expect(sql).toContain('REVOKE ALL ON TABLE public.ingestion_runs FROM anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_ingestion_run')
  })
})

