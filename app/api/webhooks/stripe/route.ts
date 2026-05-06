import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { planFromPriceId } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'
import type { Database } from '@/types/supabase'

// Stripe billing columns (stripe_customer_id, stripe_subscription_id, etc.) exist in
// production but are not yet tracked in the generated types. Cast to bypass type check.
type UserUpdate = Database['public']['Tables']['users']['Update']

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return Response.json({ error: `Webhook signature verification failed: ${String(err)}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break

      const customerId = session.customer as string
      const subscriptionId = session.subscription as string
      const userId = session.metadata?.user_id

      if (!userId) {
        console.error('checkout.session.completed: missing user_id in metadata')
        break
      }

      // Fetch subscription to get price ID
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const priceId = subscription.items.data[0]?.price.id ?? null
      const plan = planFromPriceId(priceId)
      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()

      await supabase
        .from('users')
        .update({
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id:        priceId,
          subscription_status:    subscription.status,
          current_period_end:     periodEnd,
          plan,
        } as unknown as UserUpdate)
        .eq('id', userId)

      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const priceId = subscription.items.data[0]?.price.id ?? null
      const plan = planFromPriceId(priceId)
      const periodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()

      await supabase
        .from('users')
        .update({
          stripe_price_id:     priceId,
          subscription_status: subscription.status,
          current_period_end:  periodEnd,
          plan: subscription.status === 'active' || subscription.status === 'trialing' ? plan : 'free',
        } as unknown as UserUpdate)
        .eq('stripe_subscription_id' as 'id', subscription.id)

      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription

      await supabase
        .from('users')
        .update({
          stripe_price_id:        null,
          subscription_status:    'canceled',
          current_period_end:     null,
          plan:                   'free',
        } as unknown as UserUpdate)
        .eq('stripe_subscription_id' as 'id', subscription.id)

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
      if (!invoice.subscription) break

      await supabase
        .from('users')
        .update({ subscription_status: 'past_due' } as unknown as UserUpdate)
        .eq('stripe_subscription_id' as 'id', invoice.subscription)

      break
    }

    default:
      // Unhandled event type — return 200 so Stripe doesn't retry
      break
  }

  return Response.json({ received: true })
}
