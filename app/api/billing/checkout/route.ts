import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

// Derived at startup from env — same source of truth as planFromPriceId() in lib/plans.ts.
// Filter out undefined so an unconfigured plan doesn't create an empty-string entry.
function buildPriceAllowlist(): Set<string> {
  return new Set(
    [
      process.env.STRIPE_PRICE_STARTER,
      process.env.STRIPE_PRICE_PRO,
      process.env.STRIPE_PRICE_ENTERPRISE,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0)
  )
}

const BodySchema = z.object({
  price_id: z.string().min(1),
})

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`checkout:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'price_id is required' }, { status: 400 })
  }

  const { price_id } = parsed.data

  const allowlist = buildPriceAllowlist()
  if (!allowlist.has(price_id)) {
    console.error('[billing/checkout]', `rejected unknown price_id from user ${user.id}`)
    return Response.json({ error: 'Invalid price selection' }, { status: 400 })
  }

  // Fetch existing customer ID if any
  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: 'subscription',
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/billing?success=1`,
    cancel_url:  `${baseUrl}/dashboard/billing?canceled=1`,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
  }

  // Re-use existing Stripe customer if we have one
  if (userData?.stripe_customer_id) {
    sessionParams.customer = userData.stripe_customer_id
  } else {
    sessionParams.customer_email = userData?.email ?? user.email
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams)
    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[billing/checkout] Stripe error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unable to create checkout session. Please try again.' }, { status: 502 })
  }
}
