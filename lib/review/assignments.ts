import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { ReviewerAssignmentRole } from '@/lib/adjudication/types'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/**
 * Reviewer assignments are append-only. Revocation is a separate append-only
 * fact (run_reviewer_assignment_revocations). An assignment is active iff no
 * revocation row references it.
 *
 * Every helper here fails closed: a lookup error is returned as an error, never
 * as "no assignment" and never as "active".
 */

type Db = SupabaseClient<Database>

export interface ActiveAssignment {
  id: string
  search_run_id: string
  reviewer_id: string
  assigned_by: string
  assignment_role: ReviewerAssignmentRole
  assigned_at: string
}

export interface AssignmentLookupError {
  message: string
}

const ASSIGNMENT_COLUMNS = 'id, search_run_id, reviewer_id, assigned_by, assignment_role, assigned_at'
// Keeps `.in()` filters well under URL length limits.
const IN_CHUNK = 100

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function asRole(value: string): ReviewerAssignmentRole | null {
  return value === 'primary' || value === 'secondary' || value === 'both' ? value : null
}

function toAssignment(row: Database['public']['Tables']['run_reviewer_assignments']['Row']): ActiveAssignment | null {
  const role = asRole(row.assignment_role)
  if (!role) return null
  return {
    id: row.id,
    search_run_id: row.search_run_id,
    reviewer_id: row.reviewer_id,
    assigned_by: row.assigned_by,
    assignment_role: role,
    assigned_at: row.assigned_at,
  }
}

/** Ids from `assignmentIds` that have a revocation row. */
async function revokedAssignmentIds(
  db: Db,
  assignmentIds: string[],
): Promise<{ data: Set<string>; error: AssignmentLookupError | null }> {
  const revoked = new Set<string>()
  for (const ids of chunk([...new Set(assignmentIds)], IN_CHUNK)) {
    const { data, error } = await db
      .from('run_reviewer_assignment_revocations')
      .select('assignment_id')
      .in('assignment_id', ids)
    if (error) return { data: new Set(), error: { message: error.message } }
    for (const row of data ?? []) revoked.add(row.assignment_id)
  }
  return { data: revoked, error: null }
}

async function filterActive(
  db: Db,
  rows: Database['public']['Tables']['run_reviewer_assignments']['Row'][],
): Promise<{ data: ActiveAssignment[]; error: AssignmentLookupError | null }> {
  if (rows.length === 0) return { data: [], error: null }
  const revoked = await revokedAssignmentIds(db, rows.map((row) => row.id))
  if (revoked.error) return { data: [], error: revoked.error }
  const active: ActiveAssignment[] = []
  for (const row of rows) {
    if (revoked.data.has(row.id)) continue
    const assignment = toAssignment(row)
    if (assignment) active.push(assignment)
  }
  return { data: active, error: null }
}

export async function activeAssignmentsForRun(
  db: Db,
  runId: string,
): Promise<{ data: ActiveAssignment[]; error: AssignmentLookupError | null }> {
  const { data, error } = await fetchAllRows((from, to) => db
    .from('run_reviewer_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('search_run_id', runId)
    .order('assigned_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to))
  if (error) return { data: [], error: { message: error.message } }
  return filterActive(db, data)
}

export async function activeAssignmentsForReviewer(
  db: Db,
  userId: string,
): Promise<{ data: ActiveAssignment[]; error: AssignmentLookupError | null }> {
  const { data, error } = await fetchAllRows((from, to) => db
    .from('run_reviewer_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('reviewer_id', userId)
    .order('assigned_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to))
  if (error) return { data: [], error: { message: error.message } }
  return filterActive(db, data)
}

/**
 * The caller's assignment on a run, if any, with its revocation state. Used
 * where the distinction between "never assigned" and "revoked" matters
 * (re-assignment rules). Access checks should use `isActiveReviewer`.
 */
export async function assignmentForReviewer(
  db: Db,
  runId: string,
  userId: string,
): Promise<{
  data: { assignment: ActiveAssignment; revoked: boolean } | null
  error: AssignmentLookupError | null
}> {
  const { data: row, error } = await db
    .from('run_reviewer_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('search_run_id', runId)
    .eq('reviewer_id', userId)
    .maybeSingle()
  if (error) return { data: null, error: { message: error.message } }
  if (!row) return { data: null, error: null }
  const assignment = toAssignment(row)
  if (!assignment) return { data: null, error: { message: 'unknown assignment role' } }

  const { data: revocation, error: revocationError } = await db
    .from('run_reviewer_assignment_revocations')
    .select('id')
    .eq('assignment_id', row.id)
    .maybeSingle()
  if (revocationError) return { data: null, error: { message: revocationError.message } }
  return { data: { assignment, revoked: Boolean(revocation) }, error: null }
}

/** The caller's active assignment on the run, or null. Errors fail closed. */
export async function isActiveReviewer(
  db: Db,
  runId: string,
  userId: string,
): Promise<{ data: ActiveAssignment | null; error: AssignmentLookupError | null }> {
  const { data, error } = await assignmentForReviewer(db, runId, userId)
  if (error) return { data: null, error }
  if (!data || data.revoked) return { data: null, error: null }
  return { data: data.assignment, error: null }
}

export interface UserDisplay {
  name: string
  email: string
}

/** Display names for user ids. Falls back to email when no full name is set. */
export async function userDisplayNames(
  db: Db,
  ids: Array<string | null | undefined>,
): Promise<{ data: Map<string, UserDisplay>; error: AssignmentLookupError | null }> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const out = new Map<string, UserDisplay>()
  for (const ids100 of chunk(unique, IN_CHUNK)) {
    const { data, error } = await db
      .from('users')
      .select('id, full_name, email')
      .in('id', ids100)
    if (error) return { data: new Map(), error: { message: error.message } }
    for (const row of data ?? []) {
      out.set(row.id, { name: row.full_name?.trim() || row.email, email: row.email })
    }
  }
  return { data: out, error: null }
}

export interface PublicAssignment {
  id: string
  reviewer_id: string
  reviewer_name: string
  reviewer_email: string | null
  assignment_role: ReviewerAssignmentRole
  assigned_at: string
  assigned_by: string
  assigned_by_name: string
}

export function toPublicAssignment(
  assignment: ActiveAssignment,
  users: Map<string, UserDisplay>,
): PublicAssignment {
  const reviewer = users.get(assignment.reviewer_id)
  const assignedBy = users.get(assignment.assigned_by)
  return {
    id: assignment.id,
    reviewer_id: assignment.reviewer_id,
    reviewer_name: reviewer?.name ?? 'Unknown account',
    reviewer_email: reviewer?.email ?? null,
    assignment_role: assignment.assignment_role,
    assigned_at: assignment.assigned_at,
    assigned_by: assignment.assigned_by,
    assigned_by_name: assignedBy?.name ?? 'Unknown account',
  }
}

/** Active assignments on a run, ready for display to the run owner only. */
export async function describeActiveAssignments(
  db: Db,
  runId: string,
): Promise<{ data: PublicAssignment[]; error: AssignmentLookupError | null }> {
  const assignments = await activeAssignmentsForRun(db, runId)
  if (assignments.error) return { data: [], error: assignments.error }
  const users = await userDisplayNames(db, assignments.data.flatMap((a) => [a.reviewer_id, a.assigned_by]))
  if (users.error) return { data: [], error: users.error }
  return { data: assignments.data.map((a) => toPublicAssignment(a, users.data)), error: null }
}
