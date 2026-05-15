import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(
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

  const rl = await rateLimit(`cancel-run:${user.id}`, 10, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const db = createAdminClient()

  const { data: run, error: runError } = await db
    .from('search_runs')
    .select('id, user_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const cancellable = ['running', 'filtering', 'queued']
  if (!cancellable.includes(run.status)) {
    return Response.json({ error: 'Run is not cancellable' }, { status: 409 })
  }

  const { data: cancelled, error: updateError } = await db
    .from('search_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status')
    .single()

  if (updateError || !cancelled) {
    console.error('[search-runs/cancel]', updateError?.message ?? 'Unable to cancel run')
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'search_run_cancelled', { run_id: id }, request)

  return Response.json({ run_id: cancelled.id, status: 'cancelled' })
}
