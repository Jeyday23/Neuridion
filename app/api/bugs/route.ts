import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const BugReportSchema = z.object({
  category:    z.enum(['bug', 'suggestion', 'question']),
  description: z.string().min(10).max(2000),
  page_url:    z.string().max(500).optional(),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`bugs:${ip}`, 5, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = BugReportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please provide a description (at least 10 characters).' }, { status: 400 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('bug_reports').insert({
    user_id:     user.id,
    category:    parsed.data.category,
    description: parsed.data.description,
    page_url:    parsed.data.page_url ?? null,
    user_agent:  request.headers.get('user-agent') ?? null,
  })

  if (error) {
    console.error('[bugs] insert failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
