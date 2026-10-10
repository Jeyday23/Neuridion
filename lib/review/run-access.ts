import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { ReviewerAssignmentRole } from '@/lib/adjudication/types'
import { isActiveReviewer } from '@/lib/review/assignments'

type Db = SupabaseClient<Database>

/**
 * Who may open a run page, and in which mode.
 *
 *   owner    : full page, including reviewer management, approval and reports.
 *   reviewer : an ACTIVE assigned reviewer. Results and the adjudication UI
 *              only. No delete, report generation/download, approval or
 *              reviewer management.
 *   none     : render notFound. Never disclose that the run exists.
 *
 * This decides what the page renders. The API routes enforce the same rules
 * independently and remain the real control.
 */
export type RunViewerAccess =
  | { mode: 'owner' }
  | { mode: 'reviewer'; assignment_role: ReviewerAssignmentRole }
  | { mode: 'none' }

export interface RunViewerCapabilities {
  manageReviewers: boolean
  approve: boolean
  generateReports: boolean
  deleteRun: boolean
}

export async function resolveRunViewerAccess(
  db: Db,
  run: { id: string; user_id: string },
  userId: string,
): Promise<{ data: RunViewerAccess; error: string | null }> {
  if (run.user_id === userId) return { data: { mode: 'owner' }, error: null }
  const { data, error } = await isActiveReviewer(db, run.id, userId)
  if (error) return { data: { mode: 'none' }, error: error.message }
  if (!data) return { data: { mode: 'none' }, error: null }
  return { data: { mode: 'reviewer', assignment_role: data.assignment_role }, error: null }
}

export function capabilitiesFor(access: RunViewerAccess): RunViewerCapabilities {
  const owner = access.mode === 'owner'
  return {
    manageReviewers: owner,
    approve: owner,
    generateReports: owner,
    deleteRun: owner,
  }
}
