import { createClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/plans'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import type { Json } from '@/types/supabase'
import { rateLimit, rateLimitWithIp, getClientIp } from '@/lib/rate-limit'

/** Accepts both {name, manufacturer} (current) and {device_name, manufacturer} (legacy DB rows) */
const CompetitorTermSchema = z.object({
  name:         z.string().max(100).optional(),
  device_name:  z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
}).transform((val) => ({
  name:         (val.name || val.device_name || '').trim(),
  manufacturer: val.manufacturer,
})).refine((val) => val.name.length > 0, { message: 'Competitor product name is required' })

const CreateProfileSchema = z.object({
  device_name:      z.string().min(1).max(200),
  manufacturer:     z.string().min(1).max(200),
  device_class:     z.enum(['Class I', 'Class IIa', 'Class IIb', 'Class III']).optional(),
  emdn_code:        z.string().max(20).transform(v => v ? v.toUpperCase() : v).pipe(z.string().regex(/^[A-Z]\d{2,8}$/, 'Invalid EMDN code format')).optional().or(z.literal('')).transform(v => v || null),
  intended_use:     z.string().max(2000).optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).default([]),
  strategy_doc_paths: z.array(z.string().max(500).refine((s) => { try { const d = decodeURIComponent(s); return !d.includes('..') && !d.startsWith('/') && !d.includes('\0') && !s.includes('\0') } catch { return false } }, 'Invalid file path')).max(5).default([]),
})

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`profiles-list:${user.id}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { data, error } = await supabase
    .from('product_profiles')
    .select('id, device_name, manufacturer, intended_use, emdn_code, device_class, default_dbs, search_strategy, created_at, last_modified_at')
    .is('deleted_at' as never, null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[profiles:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return Response.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = getClientIp(request)
  const rl = await rateLimitWithIp(`profiles-create:${user.id}`, 10, 60_000, ip)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed. Check your input and try again.' }, { status: 422 })
  }
  const { device_name, manufacturer, emdn_code, device_class, intended_use, competitor_terms, strategy_doc_paths } = parsed.data

  if (strategy_doc_paths.some(p => !p.startsWith(`${user.id}/`))) {
    return Response.json({ error: 'Validation failed. Check your input and try again.' }, { status: 422 })
  }

  // Enforce plan profile limit
  const { data: userData } = await supabase
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  const plan = ((userData?.plan ?? 'free') as PlanId)
  const limit = PLANS[plan].maxProfiles

  if (limit !== -1) {
    const { count } = await supabase
      .from('product_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= limit) {
      return Response.json(
        { error: 'Profile limit reached. Upgrade your plan to add more.' },
        { status: 403 }
      )
    }
  }

  const { data, error } = await supabase
    .from('product_profiles')
    .insert({
      user_id: user.id,
      device_name,
      manufacturer,
      emdn_code:       emdn_code    ?? null,
      device_class:    device_class ?? null,
      intended_use:    intended_use ?? null,
      search_strategy: { competitor_terms, strategy_doc_paths } as unknown as Json,
    })
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use, search_strategy, created_at, last_modified_at')
    .single()

  if (error) {
    console.error('[profiles:POST]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Post-insert TOCTOU guard: re-check the profile count after insert.
  // If a concurrent request slipped past the pre-check and we are now over the limit,
  // delete the just-inserted profile and return 403.
  if (limit !== -1) {
    const { count: postCount } = await supabase
      .from('product_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((postCount ?? 0) > limit) {
      await supabase
        .from('product_profiles')
        .delete()
        .eq('id', data.id)
        .eq('user_id', user.id)

      return Response.json(
        { error: 'Profile limit reached. Upgrade your plan to add more.' },
        { status: 403 }
      )
    }
  }

  await logAuditEvent(user.id, 'profile_created', { profile_id: data.id, device_name }, request)

  return Response.json(data, { status: 201 })
}
