import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import type { Json, Database } from '@/types/supabase'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III'] as const

const UpdateSchema = z.object({
  device_name:   z.string().min(1).optional(),
  manufacturer:  z.string().min(1).optional(),
  device_class:  z.enum(DEVICE_CLASSES).nullable().optional(),
  emdn_code:     z.string().nullable().optional(),
  intended_use:  z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(', ')
    return Response.json({ error: msg }, { status: 422 })
  }
  const updates = parsed.data

  const db = createAdminClient()

  // Fetch existing profile (verify ownership)
  const { data: existing, error: fetchError } = await db
    .from('product_profiles')
    .select('id, user_id, device_name, manufacturer, device_class, emdn_code, intended_use')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Compute which fields changed
  const trackableFields = ['device_name', 'manufacturer', 'device_class', 'emdn_code', 'intended_use'] as const
  const changedFields: Record<string, unknown> = {}
  const previousValues: Record<string, unknown> = {}

  for (const field of trackableFields) {
    if (field in updates && updates[field] !== undefined) {
      const incoming = updates[field] ?? null
      const current  = (existing as Record<string, unknown>)[field] ?? null
      if (incoming !== current) {
        changedFields[field]  = incoming
        previousValues[field] = current
      }
    }
  }

  const now = new Date().toISOString()

  // Insert history row if anything changed
  if (Object.keys(changedFields).length > 0) {
    await db.from('profile_edit_history').insert({
      profile_id:      id,
      edited_by:       user.id,
      changed_fields:  changedFields  as Json,
      previous_values: previousValues as Json,
    })
  }

  // Build update payload (only fields present in body)
  const updatePayload: Record<string, unknown> = {
    last_modified_at: now,
    last_modified_by: user.id,
  }
  for (const field of trackableFields) {
    if (field in updates && updates[field] !== undefined) {
      updatePayload[field] = updates[field] ?? null
    }
  }

  type ProfileUpdate = Database['public']['Tables']['product_profiles']['Update']
  const { data: updated, error: updateError } = await db
    .from('product_profiles')
    .update(updatePayload as unknown as ProfileUpdate)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 })
  }

  return Response.json(updated)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const { data: profile, error: fetchError } = await db
    .from('product_profiles')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // NULL out legacy search_run_id FK on fsn_results for all runs under this profile
  const { data: runs, error: runsError } = await db
    .from('search_runs')
    .select('id')
    .eq('profile_id', id)

  if (runsError) {
    return Response.json({ error: runsError.message }, { status: 500 })
  }

  if (runs && runs.length > 0) {
    const runIds = runs.map((r: { id: string }) => r.id)
    const { error: unlinkError } = await db
      .from('fsn_results')
      .update({ search_run_id: null })
      .in('search_run_id', runIds)

    if (unlinkError) {
      return Response.json({ error: unlinkError.message }, { status: 500 })
    }
  }

  const { data: deleted, error: deleteError } = await db
    .from('product_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .single()

  if (deleteError || !deleted) {
    return Response.json({ error: deleteError?.message ?? 'Unable to delete profile' }, { status: 500 })
  }

  return Response.json({ deleted: true })
}
