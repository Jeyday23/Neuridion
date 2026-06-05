import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { planFromPriceId } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { redis } from '@/lib/upstash'
import type Stripe from 'stripe'
import type { Database } from '@/types/supabase'

type UserUpdate = Database['public']['Tables']['users']['Update']

const STRIPE_EVENT_TTL = 259200
const STRIPE_LOCK_TTL = 300

function processedKey(eventId: string): string {
  return `stripe-event:${eventId}`
}

function lockKey(eventId: string): string {
  return `stripe-event-lock:${eventId}`
}

async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  if (!redis) return false
  return Boolean(await redis.exists(processedKey(eventId)))
}

async function claimStripeEvent(eventId: string): Promise<boolean> {
  if (!redis) return true
  const claimed = await redis.set(lockKey(eventId), 1, {
    nx: true,
    ex: STRIPE_LOCK_TTL,
  })
  return Boolean(claimed)
}

async function markStripeEventProcessed(eventId: string): Promise<void> {
  if (!redis) return
  try {
    await redis.set(processedKey(eventId), 1, { ex: STRIPE_EVENT_TTL })
    await redis.del(lockKey(eventId))
  } catch (err) {
    console.error('[stripe-webhook] Redis mark-processed failed:', eventId, err instanceof Error ? err.message : err)
  }
}

async function releaseStripeEventClaim(eventId: string): Promise<void> {
  if (!redis) return
  try {
    await redis.del(lockKey(eventId))
  } catch (err) {
    console.warn('[stripe-webhook] Redis lock cleanup failed:', eventId, err instanceof Error ? err.message : err)
  }
}

function requireStripeId(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) return value
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string' &&
    (value as { id: string }).id.length > 0
  ) {
    return (value as { id: string }).id
  }
  throw new Error(`Missing ${field}`)
}

function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items.data[0]?.current_period_end
  if (!periodEnd) return null
  return new Date(periodEnd * 1000).toISOString()
}

async function updateUserBySubscription(
  subscriptionId: string,
  fields: UserUpdate,
): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .update(fields)
    .eq('stripe_subscription_id', subscriptionId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    throw new Error(`DB update failed for subscription ${subscriptionId}: ${error?.message ?? 'no matching user'}`)
  }

  return data.id
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

  if (!redis && process.env.NODE_ENV === 'production') {
    console.error('[stripe-webhook] Redis unavailable in production — refusing to process without idempotency')
    return Response.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  let alreadyProcessed = false
  let claimed = false
  try {
    alreadyProcessed = await hasProcessedStripeEvent(event.id)
    if (!alreadyProcessed) {
      claimed = await claimStripeEvent(event.id)
    }
  } catch (err) {
    console.warn('[stripe-webhook] Redis check failed, processing without idempotency:', err instanceof Error ? err.message : err)
    alreadyProcessed = false
    claimed = true
  }

  if (alreadyProcessed) {
    return Response.json({ received: true })
  }
  if (!claimed) {
    return Response.json({ error: 'Event already processing' }, { status: 409 })
  }

  try {
    const supabase = createAdminClient()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const customerId = requireStripeId(session.customer, 'checkout.session.customer')
        const subscriptionId = requireStripeId(session.subscription, 'checkout.session.subscription')
        const userId = session.metadata?.user_id

        if (!userId) {
          throw new Error(`checkout.session.completed ${session.id}: missing user_id in metadata`)
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price.id ?? null
        const plan = planFromPriceId(priceId)

        const { data, error } = await supabase
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
          .select('id')
          .maybeSingle()

        if (error || !data) {
          throw new Error(`Failed to apply checkout session ${session.id}: ${error?.message ?? 'no matching user'}`)
        }

        try {
          await logAuditEvent(userId, 'billing_event', {
            stripe_event: 'checkout.session.completed',
            stripe_event_id: event.id,
            subscription_id: subscriptionId,
            plan,
          }, request)
        } catch (err) {
          console.warn('[stripe-webhook] audit failed:', err instanceof Error ? err.message : err)
        }

        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const priceId = subscription.items.data[0]?.price.id ?? null
        const plan = planFromPriceId(priceId)

        const userId = await updateUserBySubscription(subscription.id, {
          stripe_price_id:     priceId,
          subscription_status: subscription.status,
          current_period_end:  subscriptionPeriodEnd(subscription),
          plan: subscription.status === 'active' || subscription.status === 'trialing' ? plan : 'free',
        })

        try {
          await logAuditEvent(userId, 'billing_event', {
            stripe_event: 'customer.subscription.updated',
            stripe_event_id: event.id,
            subscription_id: subscription.id,
            new_status: subscription.status,
            plan,
          }, request)
        } catch (err) {
          console.warn('[stripe-webhook] audit failed:', err instanceof Error ? err.message : err)
        }

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        const userId = await updateUserBySubscription(subscription.id, {
          stripe_price_id:        null,
          stripe_subscription_id: null,
          subscription_status:    'canceled',
          current_period_end:     null,
          plan:                   'free',
        })

        try {
          await logAuditEvent(userId, 'billing_event', {
            stripe_event: 'customer.subscription.deleted',
            stripe_event_id: event.id,
            subscription_id: subscription.id,
          }, request)
        } catch (err) {
          console.warn('[stripe-webhook] audit failed:', err instanceof Error ? err.message : err)
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: unknown }
        if (!invoice.subscription) break

        const subscriptionId = requireStripeId(invoice.subscription, 'invoice.subscription')

        const userId = await updateUserBySubscription(subscriptionId, {
          subscription_status: 'past_due',
        })

        try {
          await logAuditEvent(userId, 'billing_event', {
            stripe_event: 'invoice.payment_failed',
            stripe_event_id: event.id,
            subscription_id: subscriptionId,
          }, request)
        } catch (err) {
          console.warn('[stripe-webhook] audit failed:', err instanceof Error ? err.message : err)
        }

        break
      }

      default:
        break
    }

    await markStripeEventProcessed(event.id)
    return Response.json({ received: true })

  } catch (err) {
    console.error('[stripe-webhook] Processing failed:', event.type, event.id, err instanceof Error ? err.message : err)
    await releaseStripeEventClaim(event.id)
    return Response.json({ error: 'processing_failed' }, { status: 500 })
  }
}
