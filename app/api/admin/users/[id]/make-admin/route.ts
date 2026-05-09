import { NextRequest, NextResponse } from 'next/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await checkIsAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({ role: 'admin' })
    .eq('id', id)

  if (error) {
    console.error('[admin:make-admin]', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(caller.id, 'admin_action', {
    action: 'make_admin',
    target_user_id: id,
  }, req)

  return NextResponse.json({ ok: true })
}
