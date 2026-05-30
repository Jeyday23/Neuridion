import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkLoginRateLimit, recordLoginAttempt, rateLimit, getClientIp } from '@/lib/rate-limit'
import { checkFailedLoginAlert } from '@/lib/security-alerts'
import { z } from 'zod'

const SendSchema = z.object({
  action: z.literal('send'),
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  const body = await req.json().catch(() => null)
  const parsed = SendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const data = parsed.data

  const rateCheck = await checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 },
    )
  }

  const supabase = await createClient()

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
