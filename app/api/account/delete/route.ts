import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { stripe } from '@/lib/stripe'
import { z } from 'zod'
import { rateLimit, rateLimitWithIp, getClientIp } from '@/lib/rate-limit'

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT'
const GRACE_PERIOD_DAYS   = 30

const DeleteAccountSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimitWithIp(`account-delete:${ip}`, 3, 300_000, ip)
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
      console.error('[account:delete] Stripe cancel failed:', err instanceof Error ? err.message : String(err))
    }
  }

  const now       = new Date()
  const deletedAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  // Mark account for deletion but defer destructive operations.
  // The cleanup worker processes expired deletions after the grace period,
  // giving the user a real window to cancel via the DELETE endpoint.
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

  await logAuditEvent(user.id, 'account_deletion_requested', {
    deletion_requested_at: now.toISOString(),
    scheduled_deleted_at:  deletedAt.toISOString(),
    stripe_cancelled:      !!userData?.stripe_subscription_id,
  }, request)

  await supabase.auth.signOut()

  return Response.json({
    ok:          true,
    deleted_at:  deletedAt.toISOString(),
    message:     `Your account is scheduled for deletion on ${deletedAt.toLocaleDateString('en-GB')}. You can cancel this by logging back in within ${GRACE_PERIOD_DAYS} days. Your subscription has been cancelled. Post-market surveillance records will be retained per EU MDR Art. 10(8).`,
  })
}

// Cancel a pending deletion
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`cancel-delete:${user.id}`, 5, 300_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const admin = createAdminClient()
  await admin
    .from('users')
    .update({ deletion_requested_at: null, deleted_at: null })
    .eq('id', user.id)

  await logAuditEvent(user.id, 'account_deletion_cancelled', {}, request)

  return Response.json({ ok: true, message: 'Account deletion cancelled.' })
}
