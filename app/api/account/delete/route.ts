import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT'
const GRACE_PERIOD_DAYS   = 30

const DeleteAccountSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
})

export async function POST(request: Request) {
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

  const now       = new Date()
  const deletedAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('users')
    .update({
      deletion_requested_at: now.toISOString(),
      deleted_at:            deletedAt.toISOString(),
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('[account:delete]', updateError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'account_deleted', {
    deletion_requested_at: now.toISOString(),
    scheduled_deleted_at:  deletedAt.toISOString(),
  }, request)

  // Console-log stub: replace with email when Resend is wired up
  console.log(`[deletion] Account ${user.email} scheduled for deletion on ${deletedAt.toISOString()}`)

  // Sign out the session
  await supabase.auth.signOut()

  return Response.json({
    ok:          true,
    deleted_at:  deletedAt.toISOString(),
    message:     `Your account will be permanently deleted on ${deletedAt.toLocaleDateString('en-GB')}. Log back in before then to cancel.`,
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
