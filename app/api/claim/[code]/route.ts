import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'
import { logAuditEvent } from '@/lib/audit'
import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const ClaimSchema = z.object({
  email: z.email({ pattern: z.regexes.html5Email }),
})

function generateTempPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 16)
}

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

  // 2. Check email lock
  const { data: usedEmail } = await admin
    .from('used_trial_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (usedEmail) {
    return Response.json({
      error: 'This email has already used a trial code. Please sign up with a different email or use paid signup.',
    }, { status: 409 })
  }

  // 3. Create auth user (skip email confirmation)
  const tempPassword = generateTempPassword()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password:       tempPassword,
    email_confirm:  true,
    user_metadata:  { plan: 'trial', trial_code: code },
  })

  if (createError) {
    if (createError.message.toLowerCase().includes('already')) {
      return Response.json({
        error: 'An account with this email already exists. Please sign in instead.',
      }, { status: 409 })
    }
    console.error('[claim]', createError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  const userId = newUser.user.id

  // 4. Set plan = 'trial' on public.users (trigger creates row, we update plan)
  await admin.from('users').upsert({ id: userId, email, plan: 'trial' }, { onConflict: 'id' })

  // 5. Lock email forever
  await admin.from('used_trial_emails').insert({
    email,
    trial_code_id: trialCode.id,
  })

  // 6. Mark code redeemed
  await admin.from('trial_codes').update({
    redeemed_by_email:   email,
    redeemed_by_user_id: userId,
    redeemed_at:         new Date().toISOString(),
  }).eq('id', trialCode.id)

  // 7. Audit log (best-effort)
  await logAuditEvent(userId, 'signup', {
    method: 'trial_code',
    code,
    batch: trialCode.batch_name,
  }, request)

  return Response.json({
    ok:       true,
    email,
    password: tempPassword,
    message:  'Account created. Please save your password and change it in Settings.',
  }, { status: 201 })
}
