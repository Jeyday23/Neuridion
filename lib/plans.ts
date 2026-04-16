export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise'

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
  starter: {
    label: 'Starter',
    priceMonthly: '€149',
    maxSearchRuns: 10,
    maxProfiles: 1,
  },
  pro: {
    label: 'Pro',
    priceMonthly: '€499',
    maxSearchRuns: 50,
    maxProfiles: 5,
  },
  enterprise: {
    label: 'Enterprise',
    priceMonthly: '€2,000+',
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
