import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFeedbackNotification } from '@/lib/email'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const FeedbackSchema = z.object({
  rating:           z.number().int().min(1).max(5),
  most_useful:      z.array(z.string().max(200)).max(20).default([]),
  missing_features: z.string().max(5000).nullable().optional(),
  triggered_by:     z.enum(['first_search', 'third_report']),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`feedback:${ip}`, 5, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = FeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { rating, most_useful, missing_features } = parsed.data

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('user_feedback').insert({
      user_id:          user.id,
      rating,
      most_useful,
      missing_features: missing_features ?? null,
      triggered_by:     parsed.data.triggered_by,
    })

    if (error) {
      console.error('[feedback] insert failed:', error?.message)
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    sendFeedbackNotification(parsed.data).catch((err) =>
      console.error('[feedback] email failed:', err instanceof Error ? err.message : 'Unknown')
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[feedback] error:', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
