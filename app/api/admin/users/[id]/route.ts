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

  const { count } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 })
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    console.error('[admin:users:DELETE]', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(caller.id, 'admin_action', {
    action: 'delete_user',
    target_user_id: id,
  }, req)

  return NextResponse.json({ ok: true })
}
