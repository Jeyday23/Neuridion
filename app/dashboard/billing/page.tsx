import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS, type PlanId } from '@/lib/plans'
import { BillingClient } from './billing-client'

export const metadata = { title: 'Billing — Neuridion' }

const UPGRADE_PLANS: PlanId[] = ['starter', 'pro', 'enterprise']

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: userData, error: userDataError } = await admin
    .from('users')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (userDataError) console.error('[billing]', 'query error:', userDataError.message, userDataError.code)

  if (!userData) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="mb-6 rounded border border-[rgba(220,38,38,0.2)] bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700 font-medium">Unable to load plan details. Please try again later.</p>
        </div>
      </div>
    )
  }

  const rawPlan = userData.plan ?? 'free'
  const currentPlan: PlanId = rawPlan in PLANS ? (rawPlan as PlanId) : 'free'

  return (
    <BillingClient
      currentPlan={currentPlan}
      hasCustomer={false}
      successParam={!!params.success}
      canceledParam={!!params.canceled}
      upgradePlans={UPGRADE_PLANS}
      stripePrices={{
        starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
        pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
      }}
    />
  )
}
