import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoveredRanges, computeUncoveredRanges } from '@/lib/sync/coverage'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { z } from 'zod'

const KNOWN_SOURCES = ['bfarm', 'mhra', 'fda', 'swissmedic'] as const
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const PreviewBodySchema = z.object({
  profile_id:   z.string().uuid(),
  period_from:  z.string().regex(ISO_DATE),
  period_to:    z.string().regex(ISO_DATE),
  selected_dbs: z.array(z.enum(KNOWN_SOURCES)).min(1).max(KNOWN_SOURCES.length),
})

const ITEMS_PER_DB_PER_DAY: Record<string, number> = {
  bfarm: 2.7, fda: 6.7, mhra: 1.0, swissmedic: 1.3,
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`preview:${ip}`, 20, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const result = PreviewBodySchema.safeParse(rawBody)
  if (!result.success) {
    return Response.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { profile_id, period_from, period_to, selected_dbs } = result.data

  const { data: profile } = await supabase
    .from('product_profiles')
    .select('id')
    .eq('id', profile_id)
    .eq('user_id', user.id)
    .single()
  if (!profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  const db = createAdminClient()
  let totalEstimated = 0

  for (const source of selected_dbs) {
    const covered = await getCoveredRanges(source)
    const uncovered = computeUncoveredRanges(covered, period_from, period_to)

    const { count } = await db
      .from('fsn_canonical')
      .select('*', { count: 'exact', head: true })
      .eq('source', source)
      .gte('fsn_date', period_from)
      .lte('fsn_date', period_to)

    const knownItems = count ?? 0

    let uncoveredDays = 0
    for (const r of uncovered) {
      const from = new Date(r.from)
      const to = new Date(r.to)
      uncoveredDays += Math.max(0, (to.getTime() - from.getTime()) / 86_400_000 + 1)
    }

    const estimatedUncovered = Math.round(uncoveredDays * (ITEMS_PER_DB_PER_DAY[source] ?? 2))
    totalEstimated += knownItems + estimatedUncovered
  }

  return Response.json({ estimated_items: totalEstimated })
}
