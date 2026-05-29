import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'

const SaveDraftSchema = z.object({
  id:               z.uuid().optional(),
  name:             z.string().max(200).optional(),
  profile_id:       z.uuid().nullable().optional(),
  from:             z.string().optional(),
  to:               z.string().optional(),
  dbs:              z.array(z.string()).max(10).optional(),
  genericTerms:     z.array(z.string().max(200)).max(50).optional(),
  manufacturerTerms: z.array(z.string().max(200)).max(50).optional(),
  uploadedPaths:    z.array(z.string().max(500).refine((s) => { const d = decodeURIComponent(s); return !d.includes('..') && !d.startsWith('/') && !d.includes('\0') && !s.includes('\0') }, 'Invalid file path')).max(20).optional(),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`search-drafts:${ip}`, 20, 60_000)
  if (!rl.allowed) return Response.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SaveDraftSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed. Check your input and try again.' }, { status: 422 })
  }
  const {
    id,
    name,
    profile_id,
    from: periodFrom,
    to: periodTo,
    dbs,
    genericTerms,
    manufacturerTerms,
    uploadedPaths,
  } = parsed.data

  if (uploadedPaths?.some(p => !p.startsWith(`${user.id}/`))) {
    return Response.json({ error: 'Validation failed. Check your input and try again.' }, { status: 422 })
  }

  const now = new Date().toISOString()

  if (id) {
    const { data: existing } = await supabase
      .from('search_drafts')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      return Response.json({ error: 'Draft not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('search_drafts')
      .update({
        name:                  name ?? null,
        profile_id:            profile_id ?? null,
        search_period_from:    periodFrom ?? null,
        search_period_to:      periodTo ?? null,
        dbs_selected:          dbs ?? [],
        generic_terms:         genericTerms ?? [],
        manufacturer_terms:    manufacturerTerms ?? [],
        uploaded_file_paths:   uploadedPaths ?? [],
        updated_at:            now,
      })
      .eq('id', id)
      .select('id, updated_at')
      .single()

    if (error) {
      console.error('[search-drafts:POST:upsert]', error.message)
      return Response.json({ error: 'Something went wrong' }, { status: 500 })
    }
    await logAuditEvent(user.id, 'preference_changed', { action: 'draft_updated', draft_id: data.id }, request)
    return Response.json({ id: data.id, saved_at: data.updated_at })
  }

  const { data, error } = await supabase
    .from('search_drafts')
    .insert({
      user_id:               user.id,
      name:                  name ?? null,
      profile_id:            profile_id ?? null,
      search_period_from:    periodFrom ?? null,
      search_period_to:      periodTo ?? null,
      dbs_selected:          dbs ?? [],
      generic_terms:         genericTerms ?? [],
      manufacturer_terms:    manufacturerTerms ?? [],
      uploaded_file_paths:   uploadedPaths ?? [],
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[search-drafts:POST:insert]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
  await logAuditEvent(user.id, 'preference_changed', { action: 'draft_created', draft_id: data.id }, request)
  return Response.json({ id: data.id, saved_at: data.created_at }, { status: 201 })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`search-drafts-get:${user.id}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { data, error } = await supabase
    .from('search_drafts')
    .select('id, name, profile_id, search_period_from, search_period_to, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[search-drafts:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
  return Response.json(data ?? [])
}
