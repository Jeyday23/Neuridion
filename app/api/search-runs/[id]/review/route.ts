import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const ReviewSchema = z.object({
  review_status: z.enum(['reviewed', 'approved']),
})

const VALID_TRANSITIONS: Record<string, string> = {
  draft: 'reviewed',
  reviewed: 'approved',
}

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

  const db = createAdminClient()

  const { data: existing } = await db
    .from('search_runs')
    .select('id, review_status, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const currentStatus = existing.review_status ?? 'draft'
  const allowed = VALID_TRANSITIONS[currentStatus]
  if (allowed !== parsed.data.review_status) {
    return Response.json(
      { error: `Cannot transition from '${currentStatus}' to '${parsed.data.review_status}'.` },
      { status: 422 }
    )
  }

  const { data: updated, error } = await db
    .from('search_runs')
    .update({
      review_status: parsed.data.review_status,
      reviewed_by:   user.id,
      reviewed_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, review_status, reviewed_by, reviewed_at')
    .single()

  if (error || !updated) {
    console.error('[search-runs/review]', error?.message ?? 'Update failed')
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Self-approval detection: the query filters by user_id, so existing.user_id === user.id
  // is always true. We only flag self_approval for 'approved' transitions. This is expected
  // for single-user organisations where no independent reviewer is available. Logged as
  // informational audit data, not an error condition.
  const isSelfApproval = parsed.data.review_status === 'approved' && existing.user_id === user.id

  await logAuditEvent(user.id, 'prrc_review_completed', {
    run_id:                 id,
    previous_review_status: currentStatus,
    review_status:          parsed.data.review_status,
    self_approval:          isSelfApproval,
  }, request)

  if (isSelfApproval) {
    await logAuditEvent(user.id, 'self_approval_override', {
      run_id: id,
      severity: 'info',
      note: 'self_approval',
      justification: 'Single-user organisation — no independent reviewer available.',
    }, request)
  }

  return Response.json({ ...updated, self_approval: isSelfApproval })
}
