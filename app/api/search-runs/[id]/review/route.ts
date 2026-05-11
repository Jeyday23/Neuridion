import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ReviewSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const db = createAdminClient()

  const { data: existing } = await db
    .from('search_runs')
    .select('id, review_status, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const allowed = VALID_TRANSITIONS[existing.review_status]
  if (allowed !== parsed.data.review_status) {
    return Response.json(
      { error: `Cannot transition from '${existing.review_status}' to '${parsed.data.review_status}'.` },
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
    .select('id, review_status, reviewed_by, reviewed_at')
    .single()

  if (error || !updated) {
    console.error('[search-runs/review]', error?.message ?? 'Update failed')
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'prrc_review_completed', {
    run_id:        id,
    review_status: parsed.data.review_status,
  }, request)

  return Response.json(updated)
}
