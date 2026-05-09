import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { stripe } from '@/lib/stripe'
import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT'
const GRACE_PERIOD_DAYS   = 30

const DeleteAccountSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = rateLimit(`account-delete:${ip}`, 3, 300_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = DeleteAccountSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: `Type "${CONFIRMATION_PHRASE}" to confirm account deletion` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  const { data: userData } = await admin
    .from('users')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (userData?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(userData.stripe_subscription_id)
    } catch (err) {
      console.error('[account:delete] Stripe cancel failed:', err)
    }
  }

  const now       = new Date()
  const deletedAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  const { error: updateError } = await admin
    .from('users')
    .update({
      deletion_requested_at: now.toISOString(),
      deleted_at:            deletedAt.toISOString(),
      subscription_status:   'canceled',
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('[account:delete]', updateError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Delete user data immediately (no reason to wait 30 days for non-account data)
  const { data: runs } = await admin
    .from('search_runs')
    .select('id')
    .eq('user_id', user.id)

  const runIds = (runs ?? []).map((r) => r.id)

  if (runIds.length > 0) {
    await admin.rpc('gdpr_purge_user_data', { p_run_ids: runIds })
    await admin.from('fsn_results').delete().in('run_id', runIds)
  }

  await Promise.all([
    admin.from('search_runs').delete().eq('user_id', user.id),
    admin.from('product_profiles').delete().eq('user_id', user.id),
    admin.from('search_drafts').delete().eq('user_id', user.id),
    admin.from('user_feedback').delete().eq('user_id', user.id),
    admin.from('pdf_usage').delete().eq('user_id', user.id),
    admin.from('login_attempts').delete().eq('email', user.email!),
    admin.from('reports').delete().eq('user_id', user.id),
  ])

  // Clean up storage files
  const { data: reportFiles } = await admin.storage
    .from('reports')
    .list(user.id)

  if (reportFiles && reportFiles.length > 0) {
    const paths = reportFiles.map((f) => `${user.id}/${f.name}`)
    await admin.storage.from('reports').remove(paths)
  }

  await logAuditEvent(user.id, 'account_deleted', {
    deletion_requested_at: now.toISOString(),
    scheduled_deleted_at:  deletedAt.toISOString(),
    data_deleted:          true,
    stripe_cancelled:      !!userData?.stripe_subscription_id,
  }, request)

  await supabase.auth.signOut()

  return Response.json({
    ok:          true,
    deleted_at:  deletedAt.toISOString(),
    message:     `Your account data has been deleted and your subscription cancelled. Your login will be removed on ${deletedAt.toLocaleDateString('en-GB')}.`,
  })
}

// Cancel a pending deletion
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  await admin
    .from('users')
    .update({ deletion_requested_at: null, deleted_at: null })
    .eq('id', user.id)

  await logAuditEvent(user.id, 'admin_action', { action: 'cancel_deletion' }, request)

  return Response.json({ ok: true, message: 'Account deletion cancelled.' })
}
