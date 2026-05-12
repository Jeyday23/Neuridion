import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { z } from 'zod'

const CONSENT_FIELDS = ['consent_terms_at', 'consent_privacy_at', 'consent_cookies_at'] as const
type ConsentField = typeof CONSENT_FIELDS[number]

const WithdrawSchema = z.object({
  withdraw: z.array(z.enum(CONSENT_FIELDS)).min(1),
})

export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`consent-read:${ip}`, 15, 60_000)
  if (!rl.allowed) return Response.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('consent_terms_at, consent_privacy_at, consent_cookies_at')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return Response.json({
    consents: {
      terms:   { granted_at: data.consent_terms_at,   active: !!data.consent_terms_at },
      privacy: { granted_at: data.consent_privacy_at, active: !!data.consent_privacy_at },
      cookies: { granted_at: data.consent_cookies_at, active: !!data.consent_cookies_at },
    },
  })
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`consent-manage:${ip}`, 5, 60_000)
  if (!rl.allowed) return Response.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = WithdrawSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Specify which consents to withdraw.' }, { status: 422 })
  }

  const admin = createAdminClient()
  const update: Partial<Record<ConsentField, null>> = {}
  for (const field of parsed.data.withdraw) {
    update[field] = null
  }

  const { error } = await admin
    .from('users')
    .update(update)
    .eq('id', user.id)

  if (error) {
    console.error('[consent/manage]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'consent_withdrawn', {
    withdrawn: parsed.data.withdraw,
  }, request)

  const withdrawsTerms = parsed.data.withdraw.includes('consent_terms_at') ||
                          parsed.data.withdraw.includes('consent_privacy_at')

  return Response.json({
    ok: true,
    account_restricted: withdrawsTerms,
    message: withdrawsTerms
      ? 'Consent withdrawn. Your account will be restricted. To continue using the service, please re-accept the terms.'
      : 'Cookie consent withdrawn successfully.',
  })
}
