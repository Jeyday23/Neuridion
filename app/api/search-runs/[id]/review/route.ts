import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { isRunAdjudicationComplete, isRunReadyForReview } from '@/lib/adjudication/readiness'
import { activeAssignmentsForRun, isActiveReviewer } from '@/lib/review/assignments'
import { z } from 'zod'

const ReviewSchema = z.object({
  review_status: z.enum(['reviewed', 'approved']),
})

const VALID_TRANSITIONS: Record<string, string> = {
  draft: 'reviewed',
  reviewed: 'approved',
}

/**
 * Run-level review gate.
 *
 *   draft -> reviewed : the owner, or an active assigned primary reviewer
 *                       ('primary' or 'both'). Sets reviewed_by / reviewed_at.
 *   reviewed -> approved : the owner only. Sets approved_by / approved_at and
 *                       never overwrites the reviewer attribution.
 *
 * Self-approval (approver is the recorded reviewer, or recorded any final
 * record-level disposition on this run) is allowed but recorded truthfully in
 * the audit trail. The DB trigger is the final control for readiness.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`review:${user.id}`, 10, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ReviewSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed. Check your input and try again.' }, { status: 422 })
  }
  const target = parsed.data.review_status

  const db = createAdminClient()

  const { data: existing } = await db
    .from('search_runs')
    .select('id, review_status, user_id, status, completed_at, reviewed_by, reviewed_at')
    .eq('id', id)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .single()

  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const isOwner = existing.user_id === user.id
  if (!isOwner) {
    const assignment = await isActiveReviewer(db, id, user.id)
    if (assignment.error) {
      console.error('[search-runs/review] assignment lookup failed:', assignment.error.message)
      return Response.json({ error: 'Review access could not be verified.' }, { status: 503 })
    }
    if (!assignment.data) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (target === 'approved') {
      return Response.json({ error: 'Only the run owner can approve this run.' }, { status: 403 })
    }
    if (assignment.data.assignment_role === 'secondary') {
      return Response.json(
        { error: 'Your assignment is second review only. A primary reviewer or the run owner marks the run as reviewed.' },
        { status: 403 },
      )
    }
  }

  if (!isRunReadyForReview(existing)) {
    return Response.json({ error: 'This search must finish successfully before review or approval.' }, { status: 422 })
  }

  const currentStatus = existing.review_status ?? 'draft'
  const allowed = VALID_TRANSITIONS[currentStatus]
  if (allowed !== target) {
    return Response.json(
      { error: `Cannot transition from '${currentStatus}' to '${target}'.` },
      { status: 422 }
    )
  }

  let selfApproval = false
  let selfApprovalBasis: string[] = []
  let activeAssignmentCount = 0

  if (target === 'approved') {
    if (!existing.reviewed_by || !existing.reviewed_at) {
      return Response.json(
        { error: 'This run has no recorded reviewer. Mark it as reviewed before approval.' },
        { status: 422 },
      )
    }

    const readiness = await isRunAdjudicationComplete(db, id)
    if (readiness.error) {
      return Response.json({ error: readiness.error }, { status: 503 })
    }
    if (!readiness.ready) {
      return Response.json(
        { error: 'Every required record must have a final disposition and any required independent second review before approval.' },
        { status: 422 },
      )
    }

    const [ownFinals, assignments] = await Promise.all([
      db.from('human_adjudication_events')
        .select('id')
        .eq('search_run_id', id)
        .eq('reviewer_id', user.id)
        .eq('phase', 'final')
        .limit(1),
      activeAssignmentsForRun(db, id),
    ])
    // Self-approval is part of the audit record. Do not approve on a guess.
    if (ownFinals.error || assignments.error) {
      console.error('[search-runs/review] self-approval check failed:',
        ownFinals.error?.message ?? assignments.error?.message)
      return Response.json({ error: 'Approval independence could not be verified. Try again.' }, { status: 503 })
    }
    if (existing.reviewed_by === user.id) selfApprovalBasis.push('approver_is_recorded_reviewer')
    if ((ownFinals.data ?? []).length > 0) selfApprovalBasis.push('approver_recorded_final_disposition')
    selfApproval = selfApprovalBasis.length > 0
    activeAssignmentCount = assignments.data.length
  } else {
    selfApprovalBasis = []
  }

  const now = new Date().toISOString()
  const patch = target === 'approved'
    ? { review_status: target, approved_by: user.id, approved_at: now }
    : { review_status: target, reviewed_by: user.id, reviewed_at: now }

  let updateQuery = db
    .from('search_runs')
    .update(patch)
    .eq('id', id)
    .eq('user_id', existing.user_id)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .eq('status', existing.status)
    .eq('completed_at', existing.completed_at!)

  updateQuery = existing.review_status == null
    ? updateQuery.is('review_status', null)
    : updateQuery.eq('review_status', currentStatus)

  const { data: updated, error } = await updateQuery
    .select('id, review_status, reviewed_by, reviewed_at, approved_by, approved_at')
    .maybeSingle()

  if (error?.code === '23514') {
    return Response.json({ error: 'Search evidence or readiness changed. Refresh and complete the required reviews.' }, { status: 409 })
  }
  if (error) {
    console.error('[search-runs/review]', error?.message ?? 'Update failed')
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
  if (!updated) {
    return Response.json({ error: 'Review status changed concurrently. Refresh and try again.' }, { status: 409 })
  }

  await logAuditEvent(user.id, 'prrc_review_completed', {
    run_id:                 id,
    previous_review_status: currentStatus,
    review_status:          target,
    actor_is_owner:         isOwner,
    reviewed_by:            updated.reviewed_by,
    approved_by:            updated.approved_by ?? null,
    self_approval:          selfApproval,
    self_approval_basis:    selfApprovalBasis,
  }, request)

  if (selfApproval) {
    await logAuditEvent(user.id, 'self_approval_override', {
      run_id: id,
      severity: 'info',
      note: 'self_approval',
      self_approval_basis: selfApprovalBasis,
      active_reviewer_assignments: activeAssignmentCount,
      justification: activeAssignmentCount === 0
        ? 'Single-user organisation: no independent reviewer was assigned to this run.'
        : 'The approver also performed review work on this run while other reviewers were assigned.',
    }, request)
  }

  return Response.json({ ...updated, self_approval: selfApproval })
}
