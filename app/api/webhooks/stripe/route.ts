import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { planFromPriceId } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { redis } from '@/lib/upstash'
import type Stripe from 'stripe'
import type { Database } from '@/types/supabase'

type UserUpdate = Database['public']['Tables']['users']['Update']

async function checkAndMarkProcessed(eventId: string): Promise<boolean> {
  if (!redis) return false
  const key = `stripe-event:${eventId}`
  const exists = await redis.exists(key)
  if (exists) return true
  await redis.set(key, 1, { ex: 259200 }) // 72 hours = Stripe max retry window
  return false
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items.data[0]?.current_period_end
  if (!periodEnd) return null
  return new Date(periodEnd * 1000).toISOString()
}

async function updateUserBySubscription(
  subscriptionId: string,
  fields: UserUpdate,
) {
  const supabase = createAdminClient()
  await supabase
    .from('users')
    .update(fields)
    .eq('stripe_subscription_id', subscriptionId)
}

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe-webhook]', String(err))
    return Response.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  const alreadyProcessed = await checkAndMarkProcessed(event.id)
  if (alreadyProcessed) {
    return Response.json({ received: true })
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

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const priceId = subscription.items.data[0]?.price.id ?? null
      const plan = planFromPriceId(priceId)

      await supabase
        .from('users')
        .update({
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id:        priceId,
          subscription_status:    subscription.status,
          current_period_end:     subscriptionPeriodEnd(subscription),
          plan,
        })
        .eq('id', userId)

      await logAuditEvent(userId, 'billing_event', {
        stripe_event: 'checkout.session.completed',
        stripe_event_id: event.id,
        subscription_id: subscriptionId,
        plan,
      }, request)

      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const priceId = subscription.items.data[0]?.price.id ?? null
      const plan = planFromPriceId(priceId)

      await updateUserBySubscription(subscription.id, {
        stripe_price_id:     priceId,
        subscription_status: subscription.status,
        current_period_end:  subscriptionPeriodEnd(subscription),
        plan: subscription.status === 'active' || subscription.status === 'trialing' ? plan : 'free',
      })

      await logAuditEvent(null, 'billing_event', {
        stripe_event: 'customer.subscription.updated',
        stripe_event_id: event.id,
        subscription_id: subscription.id,
        new_status: subscription.status,
        plan,
      }, request)

      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription

      await updateUserBySubscription(subscription.id, {
        stripe_price_id:        null,
        subscription_status:    'canceled',
        current_period_end:     null,
        plan:                   'free',
      })

      await logAuditEvent(null, 'billing_event', {
        stripe_event: 'customer.subscription.deleted',
        stripe_event_id: event.id,
        subscription_id: subscription.id,
      }, request)

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
      if (!invoice.subscription) break

      await updateUserBySubscription(invoice.subscription, {
        subscription_status: 'past_due',
      })

      await logAuditEvent(null, 'billing_event', {
        stripe_event: 'invoice.payment_failed',
        stripe_event_id: event.id,
        subscription_id: invoice.subscription,
      }, request)

      break
    }

    default:
      break
  }

  return Response.json({ received: true })
}
