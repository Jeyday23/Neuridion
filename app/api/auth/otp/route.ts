import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkLoginRateLimit, recordLoginAttempt, rateLimit, getClientIp } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'
import { checkFailedLoginAlert } from '@/lib/security-alerts'
import { z } from 'zod'

const SendSchema = z.object({
  action: z.literal('send'),
  email: z.string().email(),
})

const VerifySchema = z.object({
  action: z.literal('verify'),
  email: z.string().email(),
  code: z.string().min(6).max(8),
})

const RequestSchema = z.discriminatedUnion('action', [SendSchema, VerifySchema])

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const data = parsed.data

  // For verify action, check per-email rate limit BEFORE per-IP rate limit
  if (data.action === 'verify') {
    const emailRl = await rateLimit(`otp-verify-email:${data.email}`, 5, 900_000) // 5 attempts per 15 min per email
    if (!emailRl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 },
      )
    }
  }

  const rateCheck = await checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 },
    )
  }

  const supabase = await createClient()

  if (data.action === 'send') {
    const emailLimit = await rateLimit(`otp-send:${data.email}`, 3, 15 * 60 * 1000)
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Please wait a moment before requesting a new code.' },
        { status: 429 },
      )
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: { shouldCreateUser: false },
    })

    await recordLoginAttempt(ip, data.email, !error)
    if (error) checkFailedLoginAlert(ip).catch(() => {})

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

  // Per-IP rate limit for verify (in addition to the per-email check above)
  const verifyLimit = await rateLimit(`otp-verify:${ip}`, 10, 15 * 60 * 1000)
  if (!verifyLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many verification attempts. Try again later.' },
      { status: 429 },
    )
  }

  const { data: session, error } = await supabase.auth.verifyOtp({
    email: data.email,
    token: data.code,
    type: 'email',
  })

  await recordLoginAttempt(ip, data.email, !error)
  if (error) checkFailedLoginAlert(ip).catch(() => {})

  if (error) {
    logAuditEvent(null, 'login_failed', { email: data.email, method: 'otp', reason: 'invalid_code' }, req).catch(() => {})
    return NextResponse.json(
      { error: 'Invalid or expired code. Please try again.' },
      { status: 400 },
    )
  }

  const userId = session.user?.id
  await logAuditEvent(userId ?? null, 'login', { email: data.email, method: 'otp' })

  if (!userId) {
    return NextResponse.json({ ok: true, redirect: '/dashboard/search' })
  }

  const adminClient = createAdminClient()
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  const redirect = userRow?.role === 'admin' ? '/admin' : '/dashboard/search'

  return NextResponse.json({ ok: true, redirect })
}
