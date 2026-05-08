import { NextRequest, NextResponse } from 'next/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await checkIsAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient()

  // Delete from auth.users — cascades to public.users
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    console.error('[admin:users:DELETE]', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
