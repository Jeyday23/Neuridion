import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import type { Json, Database } from '@/types/supabase'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III'] as const

/** Accepts both {name, manufacturer} (current) and {device_name, manufacturer} (legacy DB rows) */
const CompetitorTermSchema = z.object({
  name:         z.string().max(100).optional(),
  device_name:  z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
}).transform((val) => ({
  name:         (val.name || val.device_name || '').trim(),
  manufacturer: val.manufacturer,
})).refine((val) => val.name.length > 0, { message: 'Competitor product name is required' })

const UpdateSchema = z.object({
  device_name:      z.string().min(1).optional(),
  manufacturer:     z.string().min(1).optional(),
  device_class:     z.enum(DEVICE_CLASSES).nullable().optional(),
  emdn_code:        z.string().max(20).regex(/^[A-Za-z]\d{2,8}$/, 'Invalid EMDN code format').nullable().optional().or(z.literal('')).transform(v => v || null),
  intended_use:     z.string().nullable().optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`profiles-update:${user.id}`, 10, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed. Check your input and try again.' }, { status: 422 })
  }
  const updates = parsed.data

  const db = createAdminClient()

  // Fetch existing profile (verify ownership)
  const { data: existing, error: fetchError } = await db
    .from('product_profiles')
    .select('id, user_id, device_name, manufacturer, device_class, emdn_code, intended_use, search_strategy')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
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

  if (updates.competitor_terms !== undefined) {
    const prevStrategy = (existing as Record<string, unknown>).search_strategy
    const prev = (prevStrategy as Record<string, unknown> | null)?.competitor_terms ?? []
    if (JSON.stringify(prev) !== JSON.stringify(updates.competitor_terms)) {
      changedFields['competitor_terms'] = updates.competitor_terms
      previousValues['competitor_terms'] = prev
    }
  }

  const now = new Date().toISOString()

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

  if (updates.competitor_terms !== undefined) {
    updatePayload.search_strategy = { competitor_terms: updates.competitor_terms } as unknown as Json
  }

  type ProfileUpdate = Database['public']['Tables']['product_profiles']['Update']
  const { data: updated, error: updateError } = await db
    .from('product_profiles')
    .update(updatePayload as unknown as ProfileUpdate)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use, search_strategy, last_modified_at')
    .single()

  if (updateError) {
    console.error('[profiles/update]', updateError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Insert history row AFTER successful update to avoid phantom audit entries
  if (Object.keys(changedFields).length > 0) {
    await db.from('profile_edit_history').insert({
      profile_id:      id,
      edited_by:       user.id,
      changed_fields:  changedFields  as Json,
      previous_values: previousValues as Json,
    })
  }

  if (Object.keys(changedFields).length > 0) {
    await logAuditEvent(user.id, 'profile_updated', { profile_id: id, changed_fields: changedFields }, request)
  }

  return Response.json(updated)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`profiles-delete:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const db = createAdminClient()

  const { data: profile, error: fetchError } = await db
    .from('product_profiles')
    .select('id, user_id, ifu_storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !profile) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Clean up IFU document storage file using the stored path
  const ifuPath = (profile as Record<string, unknown>).ifu_storage_path
  if (typeof ifuPath === 'string' && ifuPath.length > 0) {
    await db.storage.from('ifu-documents').remove([ifuPath])
  }

  // NULL out legacy search_run_id FK on fsn_results for all runs under this profile
  const { data: runs, error: runsError } = await db
    .from('search_runs')
    .select('id')
    .eq('profile_id', id)

  if (runsError) {
    console.error('[profiles/delete]', runsError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  if (runs && runs.length > 0) {
    const runIds = runs.map((r: { id: string }) => r.id)
    const { error: unlinkError } = await db
      .from('fsn_results')
      .update({ search_run_id: null })
      .in('search_run_id', runIds)

    if (unlinkError) {
      console.error('[profiles/delete]', unlinkError.message)
      return Response.json({ error: 'Something went wrong' }, { status: 500 })
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
    console.error('[profiles/delete]', deleteError?.message ?? 'Unable to delete profile')
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'profile_deleted', { profile_id: id }, _request)

  return Response.json({ deleted: true })
}
