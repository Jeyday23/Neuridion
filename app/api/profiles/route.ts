import { createClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/plans'
import { z } from 'zod'
import { logAuditEvent } from '@/lib/audit'
import type { Json } from '@/types/supabase'
import { rateLimit } from '@/lib/rate-limit'

const CompetitorTermSchema = z.object({
  name:         z.string().min(1).max(100),
  manufacturer: z.string().max(100).optional(),
})

const CreateProfileSchema = z.object({
  device_name:      z.string().min(1).max(200),
  manufacturer:     z.string().min(1).max(200),
  device_class:     z.enum(['Class I', 'Class IIa', 'Class IIb', 'Class III']).optional(),
  emdn_code:        z.string().max(20).optional(),
  intended_use:     z.string().max(2000).optional(),
  competitor_terms: z.array(CompetitorTermSchema).max(20).default([]),
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
    .select('id, user_id, device_name, manufacturer, intended_use, emdn_code, device_class, default_dbs, search_strategy, created_at, last_modified_at')
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

  const rl = await rateLimit(`profiles-create:${user.id}`, 10, 60_000)
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
  const { device_name, manufacturer, emdn_code, device_class, intended_use, competitor_terms } = parsed.data

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
      search_strategy: { competitor_terms } as unknown as Json,
    })
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use, search_strategy, created_at, last_modified_at')
    .single()

  if (error) {
    console.error('[profiles:POST]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'profile_created', { profile_id: data.id, device_name }, request)

  return Response.json(data, { status: 201 })
}
