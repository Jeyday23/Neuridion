import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { price_id?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { price_id } = body
  if (!price_id) {
    return Response.json({ error: 'price_id is required' }, { status: 422 })
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

  const session = await stripe.checkout.sessions.create(sessionParams)

  return Response.json({ url: session.url })
}
