import { describe, expect, it } from 'vitest'
import { createFakeDb } from '../api/fake-supabase'
import { capabilitiesFor, resolveRunViewerAccess } from '@/lib/review/run-access'

const RUN = { id: '11111111-2222-4333-8444-555555555555', user_id: 'owner' }
const ASSIGNMENT_ID = '77777777-7777-4777-8777-777777777777'

function db(opts: { assigned?: string; role?: string; revoked?: boolean; fail?: boolean } = {}) {
  const fake = createFakeDb({
    run_reviewer_assignments: opts.assigned ? [{
      id: ASSIGNMENT_ID, search_run_id: RUN.id, reviewer_id: opts.assigned, assigned_by: 'owner',
      assignment_role: opts.role ?? 'primary', assigned_at: '2026-10-01T00:00:00Z',
    }] : [],
    run_reviewer_assignment_revocations: opts.revoked
      ? [{ id: 'rv', assignment_id: ASSIGNMENT_ID, revoked_by: 'owner' }]
      : [],
  })
  if (opts.fail) fake.failTables.add('run_reviewer_assignments')
  return fake as never
}

describe('run page viewer access', () => {
  it('gives the owner full capabilities without an assignment lookup', async () => {
    const result = await resolveRunViewerAccess(db({ fail: true }), RUN, 'owner')
    expect(result).toEqual({ data: { mode: 'owner' }, error: null })
    expect(capabilitiesFor(result.data)).toEqual({
      manageReviewers: true, approve: true, generateReports: true, deleteRun: true,
    })
  })

  it('gives an active assigned reviewer reviewer mode with no owner capabilities', async () => {
    const result = await resolveRunViewerAccess(db({ assigned: 'rita', role: 'secondary' }), RUN, 'rita')
    expect(result).toEqual({ data: { mode: 'reviewer', assignment_role: 'secondary' }, error: null })
    expect(capabilitiesFor(result.data)).toEqual({
      manageReviewers: false, approve: false, generateReports: false, deleteRun: false,
    })
  })

  it('denies a revoked reviewer', async () => {
    const result = await resolveRunViewerAccess(db({ assigned: 'rita', revoked: true }), RUN, 'rita')
    expect(result.data).toEqual({ mode: 'none' })
  })

  it('denies an unrelated user', async () => {
    const result = await resolveRunViewerAccess(db({ assigned: 'rita' }), RUN, 'mallory')
    expect(result.data).toEqual({ mode: 'none' })
  })

  it('fails closed on lookup errors', async () => {
    const result = await resolveRunViewerAccess(db({ assigned: 'rita', fail: true }), RUN, 'rita')
    expect(result.data).toEqual({ mode: 'none' })
    expect(result.error).toBeTruthy()
  })
})
