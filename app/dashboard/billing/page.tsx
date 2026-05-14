import { createClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/plans'
import { BillingActions } from './billing-actions'

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
  const { data: userData } = await supabase
    .from('users')
    .select('plan, subscription_status, current_period_end, stripe_customer_id')
    .eq('id', user!.id)
    .single()

  const currentPlan = (userData?.plan ?? 'free') as PlanId
  const planInfo = PLANS[currentPlan]
  const isActive = userData?.subscription_status === 'active' || userData?.subscription_status === 'trialing'
  const hasCustomer = !!userData?.stripe_customer_id

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Billing</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your subscription and plan.</p>
      </div>

      {/* Flash messages */}
      {params.success && (
        <div className="mb-6 rounded border border-[rgba(5,150,105,0.2)] bg-[rgba(5,150,105,0.08)] px-4 py-3">
          <p className="text-sm text-[#059669] font-medium">Subscription activated — thank you!</p>
        </div>
      )}
      {params.canceled && (
        <div className="mb-6 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <p className="text-sm text-[#134E4A]">Checkout was canceled. Your plan was not changed.</p>
        </div>
      )}

      {/* Current plan card */}
      <div className="mb-8 rounded-md border border-[#E2E8F0] bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">Current plan</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-900">{planInfo.label}</span>
              <span className="text-lg text-zinc-500">{planInfo.priceMonthly}{currentPlan !== 'free' ? '/mo' : ''}</span>
            </div>
            {userData?.subscription_status && userData.subscription_status !== 'inactive' && (
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                  isActive
                    ? 'bg-[rgba(5,150,105,0.08)] text-[#059669] border-[rgba(5,150,105,0.2)]'
                    : userData.subscription_status === 'past_due'
                    ? 'bg-[rgba(220,38,38,0.06)] text-[#DC2626] border-[rgba(220,38,38,0.2)]'
                    : 'bg-[#F8FAFC] text-[#0F766E] border-[#E2E8F0]'
                }`}>
                  {userData.subscription_status}
                </span>
                {userData.current_period_end && (
                  <span className="text-xs text-zinc-400">
                    Renews {new Date(userData.current_period_end).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Manage subscription button for paying customers */}
          {hasCustomer && currentPlan !== 'free' && (
            <BillingActions mode="portal" />
          )}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
          {PLANS[currentPlan].features.map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-sm text-zinc-600">
              <svg className="h-4 w-4 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Upgrade plans */}
      {(currentPlan === 'free' || !isActive) && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">Upgrade your plan</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {UPGRADE_PLANS.filter((p) => p !== currentPlan).map((planId) => {
              const plan = PLANS[planId]
              const priceId = planId === 'starter'
                ? process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER
                : planId === 'pro'
                ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO
                : null  // Enterprise: contact sales

              return (
                <div
                  key={planId}
                  className={`rounded-md border bg-white px-5 py-5 flex flex-col ${
                    planId === 'pro' ? 'border-[#0D9488] ring-1 ring-[rgba(13,148,136,0.2)]' : 'border-[#E2E8F0]'
                  }`}
                >
                  {planId === 'pro' && (
                    <span className="mb-3 self-start rounded bg-[#0D9488] px-2.5 py-0.5 text-xs font-medium text-white">
                      Most popular
                    </span>
                  )}
                  <p className="text-base font-bold text-zinc-900">{plan.label}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {plan.priceMonthly}{planId !== 'enterprise' ? '/mo' : ''}
                  </p>

                  <ul className="mt-4 flex-1 space-y-2">
                    {PLANS[planId].features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-zinc-600">
                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5">
                    {priceId ? (
                      <BillingActions mode="checkout" priceId={priceId} label={`Upgrade to ${plan.label}`} />
                    ) : (
                      <a
                        href="mailto:info@neuridion.eu?subject=Enterprise inquiry"
                        className="block w-full rounded border border-[#E2E8F0] bg-white px-4 py-2 text-center text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors"
                      >
                        Contact sales
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
