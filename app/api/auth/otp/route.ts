import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'

const SendSchema = z.object({
  action: z.literal('send'),
  email: z.string().email(),
})

const VerifySchema = z.object({
  action: z.literal('verify'),
  email: z.string().email(),
  code: z.string().length(6),
})

const RequestSchema = z.discriminatedUnion('action', [SendSchema, VerifySchema])

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  const rateCheck = await checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const supabase = await createClient()
  const data = parsed.data

  if (data.action === 'send') {
    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: { shouldCreateUser: false },
    })

    await recordLoginAttempt(ip, data.email, !error)

    if (error) {
      if (error.status === 429 || error.message?.includes('security purposes')) {
        return NextResponse.json(
          { error: 'Please wait a moment before requesting a new code.' },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { error: 'Unable to send verification code. Check your email and try again.' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  }

  const { data: session, error } = await supabase.auth.verifyOtp({
    email: data.email,
    token: data.code,
    type: 'email',
  })

  await recordLoginAttempt(ip, data.email, !error)

  if (error) {
    return NextResponse.json(
      { error: 'Invalid or expired code. Please try again.' },
      { status: 400 },
    )
  }

  await logAuditEvent(session.user?.id ?? null, 'login', { email: data.email, method: 'otp' })

  const adminClient = createAdminClient()
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', session.user!.id)
    .single()

  const redirect = userRow?.role === 'admin' ? '/admin' : '/dashboard/search'

  return NextResponse.json({ ok: true, redirect })
}
