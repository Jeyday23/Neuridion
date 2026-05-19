import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`portal:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_customer_id) {
    return Response.json({ error: 'No billing account found' }, { status: 404 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   userData.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/billing`,
    })
    logAuditEvent(user.id, 'billing_event', { action: 'portal_access' }, request).catch(console.error)
    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[billing/portal] Stripe error:', err instanceof Error ? err.message : String(err))
    return Response.json({ error: 'Unable to open billing portal. Please try again.' }, { status: 502 })
  }
}
