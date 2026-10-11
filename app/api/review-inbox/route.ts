import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { loadReviewInbox } from '@/lib/review/inbox'

/**
 * GET /api/review-inbox
 *
 * Runs that need the caller's human review work. Scope is derived only from
 * the authenticated user id: active reviewer assignments plus the caller's own
 * runs with open required records. No input widens it.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`review-inbox:${user.id}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1_000)) } },
    )
  }

  const db = createAdminClient()
  const inbox = await loadReviewInbox(db, user.id)
  if (inbox.error || !inbox.data) {
    console.error('[review-inbox] load failed:', inbox.error ?? 'no data')
    return Response.json({ error: 'The review inbox could not be loaded.' }, { status: 503 })
  }

  return Response.json(inbox.data, { headers: { 'Cache-Control': 'no-store' } })
}
