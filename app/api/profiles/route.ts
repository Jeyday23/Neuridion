import { createClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/plans'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('product_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}

export async function POST(request: Request) {
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

  const { device_name, manufacturer, emdn_code, device_class, intended_use } = body

  if (!device_name || !manufacturer) {
    return Response.json(
      { error: 'device_name and manufacturer are required' },
      { status: 422 }
    )
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
        { error: `Your ${PLANS[plan].label} plan allows up to ${limit} product profile${limit === 1 ? '' : 's'}. Upgrade to add more.` },
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
      emdn_code:    emdn_code    ?? null,
      device_class: device_class ?? null,
      intended_use: intended_use ?? null,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data, { status: 201 })
}
