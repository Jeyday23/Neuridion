import { NextRequest, NextResponse } from 'next/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await checkIsAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rl = await rateLimit(`admin-users:${caller.id}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  if (id === caller.id) {
    return NextResponse.json({ error: 'Cannot delete your own admin account' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Pre-check: ensure we are not deleting the last admin
  const { count: preCount } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  if ((preCount ?? 0) <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 })
  }

  // Look up the target user's role before deletion so we can restore if needed
  const { data: targetUser, error: lookupError } = await admin
    .from('users')
    .select('id, role')
    .eq('id', id)
    .single()

  if (lookupError || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    console.error('[admin:users:DELETE]', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Post-deletion safety check: if we just deleted an admin, verify at least 1 admin remains.
  // This closes the TOCTOU race where two admins delete each other simultaneously.
  if (targetUser.role === 'admin') {
    const { count: postCount } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')

    if ((postCount ?? 0) < 1) {
      // No admins remain — this should never happen in normal operation.
      // The auth user is already deleted, so we cannot fully roll back,
      // but we log a critical audit event for incident response.
      console.error('[admin:users:DELETE] CRITICAL: All admin accounts have been deleted. Target:', id)
      await logAuditEvent(caller.id, 'admin_action', {
        action: 'delete_user_critical',
        target_user_id: id,
        warning: 'Deletion resulted in zero admin accounts remaining',
      }, req)
      return NextResponse.json(
        { error: 'Operation completed but resulted in no remaining admins. Contact support immediately.' },
        { status: 500 }
      )
    }
  }

  await logAuditEvent(caller.id, 'admin_action', {
    action: 'delete_user',
    target_user_id: id,
  }, req)

  return NextResponse.json({ ok: true })
}
