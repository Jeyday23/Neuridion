import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'
import type { TablesUpdate } from '@/types/supabase'

/**
 * GET /api/account/preferences
 * Returns the current GDPR processing flags for the authenticated user.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('processing_restricted, ai_opt_out')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    console.error('[account:preferences] GET failed:', error?.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return Response.json({
    processing_restricted: data.processing_restricted,
    ai_opt_out: data.ai_opt_out,
  })
}

const PatchSchema = z
  .object({
    processing_restricted: z.boolean().optional(),
    ai_opt_out: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.processing_restricted !== undefined || v.ai_opt_out !== undefined,
    { message: 'At least one field must be provided' },
  )

/**
 * PATCH /api/account/preferences
 * Updates GDPR processing flags for the authenticated user.
 *
 * Body: { processing_restricted?: boolean, ai_opt_out?: boolean }
 *
 * - GDPR Art 18: `processing_restricted` restricts data processing while
 *   keeping the data stored (e.g. during a dispute about accuracy).
 * - GDPR Art 21/22: `ai_opt_out` lets the user object to automated AI
 *   filtering of their search results.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  const updates: TablesUpdate<'users'> = {}
  if (parsed.data.processing_restricted !== undefined) {
    updates.processing_restricted = parsed.data.processing_restricted
  }
  if (parsed.data.ai_opt_out !== undefined) {
    updates.ai_opt_out = parsed.data.ai_opt_out
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('users')
    .update(updates)
    .eq('id', user.id)

  if (updateError) {
    console.error('[account:preferences] PATCH failed:', updateError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Audit logging — fire-and-forget (logAuditEvent never throws)
  if (parsed.data.processing_restricted !== undefined) {
    await logAuditEvent(
      user.id,
      'admin_action',
      { action: 'processing_restricted', restricted: parsed.data.processing_restricted },
      request,
    )
  }
  if (parsed.data.ai_opt_out !== undefined) {
    await logAuditEvent(
      user.id,
      'admin_action',
      { action: 'ai_opt_out_changed', ai_opt_out: parsed.data.ai_opt_out },
      request,
    )
  }

  return Response.json({
    ok: true,
    ...(parsed.data.processing_restricted !== undefined && { processing_restricted: parsed.data.processing_restricted }),
    ...(parsed.data.ai_opt_out !== undefined && { ai_opt_out: parsed.data.ai_opt_out }),
  })
}
