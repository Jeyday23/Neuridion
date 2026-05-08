export type PlanId = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise'

export interface PlanLimits {
  maxSearchRuns: number   // -1 = unlimited
  maxProfiles: number     // -1 = unlimited
  label: string
  priceMonthly: string    // display string
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    label: 'Free',
    priceMonthly: '€0',
    maxSearchRuns: 1,
    maxProfiles: 1,
  },
  trial: {
    label: 'Trial',
    priceMonthly: '€0',
    maxSearchRuns: 1,
    maxProfiles: 1,
  },
  starter: {
    label: 'Starter',
    priceMonthly: '€199',
    maxSearchRuns: 15,
    maxProfiles: 3,
  },
  pro: {
    label: 'Pro',
    priceMonthly: '€599',
    maxSearchRuns: 50,
    maxProfiles: 10,
  },
  enterprise: {
    label: 'Enterprise',
    priceMonthly: 'Custom',
    maxSearchRuns: -1,
    maxProfiles: -1,
  },
}

// Map Stripe price IDs → plan IDs (set in env)
export function planFromPriceId(priceId: string | null | undefined): PlanId {
  if (!priceId) return 'free'
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise'
  return 'free'
}
