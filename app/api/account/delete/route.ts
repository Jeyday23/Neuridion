import { createHash } from 'crypto'
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

  // EU MDR Art. 10(8): PMS records (search_runs, fsn_results, filter_decisions,
  // product_profiles, reports) must be retained for 10 years.
  // GDPR Art. 17(3)(b): erasure exempted when retention is required by EU law.
  // Strategy: anonymize user PII via RPC, delete non-PMS personal data, keep
  // surveillance records intact for regulatory traceability.

  await admin.rpc('gdpr_purge_user_data', { target_user_id: user.id })

  // Delete storage files that are NOT part of the PMS record
  // IFU documents — uploaded by user, not generated surveillance output
  const { data: userProfiles } = await admin
    .from('product_profiles')
    .select('id')
    .eq('user_id', user.id)

  const profileIds = (userProfiles ?? []).map((p) => p.id)

  if (profileIds.length > 0) {
    const ifuListResults = await Promise.all(
      profileIds.map((pid) => admin.storage.from('ifu-documents').list(pid))
    )
    const allIfuPaths = ifuListResults.flatMap((result, idx) =>
      (result.data ?? []).map((f) => `${profileIds[idx]}/${f.name}`)
    )
    if (allIfuPaths.length > 0) {
      await admin.storage.from('ifu-documents').remove(allIfuPaths)
    }
  }

  // Search attachments — user-uploaded files
  const { data: attachFiles } = await admin.storage
    .from('search-attachments')
    .list(user.id)

  if (attachFiles && attachFiles.length > 0) {
    await admin.storage.from('search-attachments').remove(attachFiles.map((f) => `${user.id}/${f.name}`))
  }

  // Login attempts — security log, not PMS data
  if (user.email) {
    const emailHash = createHash('sha256').update(user.email.toLowerCase()).digest('hex').slice(0, 32)
    await admin.from('login_attempts').delete().eq('email', emailHash)
  }

  await logAuditEvent(user.id, 'account_deleted', {
    deletion_requested_at: now.toISOString(),
    scheduled_deleted_at:  deletedAt.toISOString(),
    pii_anonymized:        true,
    pms_records_retained:  true,
    stripe_cancelled:      !!userData?.stripe_subscription_id,
  }, request)

  await supabase.auth.signOut()

  return Response.json({
    ok:          true,
    deleted_at:  deletedAt.toISOString(),
    message:     `Your personal data has been anonymized and your subscription cancelled. Post-market surveillance records are retained per EU MDR Art. 10(8). Your login will be removed on ${deletedAt.toLocaleDateString('en-GB')}.`,
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
