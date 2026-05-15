import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const ClaimSchema = z.object({
  email: z.email({ pattern: z.regexes.html5Email }),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`claim:${ip}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { code } = await params

  if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
    return Response.json({ error: 'Invalid code format' }, { status: 400 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ClaimSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'A valid email address is required.' }, { status: 400 })
  }
  const email = parsed.data.email.trim().toLowerCase()

  const admin = createAdminClient()

  // 1. Validate code
  const { data: trialCode, error: codeError } = await admin
    .from('trial_codes')
    .select('id, redeemed_at, expires_at, batch_name')
    .eq('code', code)
    .single()

  const codeInvalid = codeError || !trialCode || trialCode.redeemed_at ||
    (trialCode?.expires_at && new Date(trialCode.expires_at) < new Date())

  if (codeInvalid) {
    return Response.json({ error: 'This code is invalid or has already been used.' }, { status: 400 })
  }

  // 2. Atomically claim the code FIRST (prevents TOCTOU double-redemption)
  const { data: redeemed } = await admin.from('trial_codes').update({
    redeemed_by_email: email,
    redeemed_at:       new Date().toISOString(),
  }).eq('id', trialCode.id).is('redeemed_at', null).select('id').maybeSingle()

  if (!redeemed) {
    return Response.json({ error: 'This code could not be redeemed. Please check the code and try again.' }, { status: 409 })
  }

  // 3. Check email lock
  const { data: usedEmail } = await admin
    .from('used_trial_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (usedEmail) {
    // Unredeemed the code since we cannot proceed
    console.error('[claim] Email already used a trial code')
    await admin.from('trial_codes').update({
      redeemed_by_email: null,
      redeemed_at:       null,
    }).eq('id', trialCode.id)
    return Response.json({
      error: 'This code could not be redeemed. Please check the code and try again.',
    }, { status: 409 })
  }

  // 4. Create auth user (internal password never exposed)
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password:       randomBytes(32).toString('base64url'),
    email_confirm:  true,
    user_metadata:  { plan: 'trial', trial_code: code },
  })

  if (createError) {
    // Unredeemed the code since user creation failed
    console.error('[claim] User creation failed:', createError.message)
    await admin.from('trial_codes').update({
      redeemed_by_email: null,
      redeemed_at:       null,
    }).eq('id', trialCode.id)
    if (createError.message.toLowerCase().includes('already')) {
      return Response.json({
        error: 'This code could not be redeemed. Please check the code and try again.',
      }, { status: 409 })
    }
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  const userId = newUser.user.id

  // 5. Finalize code redemption with user ID
  await admin.from('trial_codes').update({
    redeemed_by_user_id: userId,
  }).eq('id', trialCode.id)

  // 6. Set plan = 'trial' on public.users
  await admin.from('users').upsert({ id: userId, email, plan: 'trial' }, { onConflict: 'id' })

  // 7. Lock email forever
  await admin.from('used_trial_emails').insert({
    email,
    trial_code_id: trialCode.id,
  })

  // 8. Audit log
  await logAuditEvent(userId, 'signup', {
    method: 'trial_code',
    code,
    batch: trialCode.batch_name,
  }, request)

  // 9. Send OTP code to the user's email for passwordless sign-in
  const supabase = await createClient()
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (otpError) {
    console.error('[claim] OTP send failed:', otpError.message)
  }

  return Response.json({ ok: true }, { status: 201 })
}
