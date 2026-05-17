export type PlanId = 'free' | 'trial' | 'starter' | 'pro' | 'enterprise'

export interface PlanLimits {
  maxSearchRuns: number   // -1 = unlimited
  maxProfiles: number     // -1 = unlimited
  label: string
  priceMonthly: string    // display string
  features: string[]
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    label: 'Free',
    priceMonthly: '€0',
    maxSearchRuns: 1,
    maxProfiles: 1,
    features: ['1 search run', '1 product profile', 'BfArM database', 'PDF & Excel reports'],
  },
  trial: {
    label: 'Trial',
    priceMonthly: '€0',
    maxSearchRuns: 1,
    maxProfiles: 1,
    features: ['1 free search run', '1 product profile', 'BfArM database', 'PDF & Excel reports'],
  },
  starter: {
    label: 'Starter',
    priceMonthly: '€199',
    maxSearchRuns: 15,
    maxProfiles: 3,
    features: ['3 device profiles', '15 searches per month', 'All P1 databases (BfArM, FDA, MHRA)', 'PDF, Word & Excel reports', 'Email notifications'],
  },
  pro: {
    label: 'Pro',
    priceMonthly: '€599',
    maxSearchRuns: 50,
    maxProfiles: 10,
    features: ['10 device profiles', '50 searches per month', 'All databases', 'PDF, Word & Excel reports', 'Email notifications', 'Priority support'],
  },
  enterprise: {
    label: 'Enterprise',
    priceMonthly: 'Custom',
    maxSearchRuns: -1,
    maxProfiles: -1,
    features: ['Unlimited everything', 'Custom database integrations', 'Dedicated account manager', 'SLA agreement', 'Custom onboarding'],
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
