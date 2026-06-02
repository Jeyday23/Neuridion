'use client'

import { useLanguage } from '@/app/dashboard/language-context'
import type { PlanId } from '@/lib/plans'
import { PLANS } from '@/lib/plans'
import { BillingActions } from './billing-actions'

interface Props {
  currentPlan: PlanId
  hasCustomer: boolean
  successParam: boolean
  canceledParam: boolean
  upgradePlans: PlanId[]
  stripePrices: Record<string, string | undefined>
}

export function BillingClient({
  currentPlan,
  hasCustomer,
  successParam,
  canceledParam,
  upgradePlans,
  stripePrices,
}: Props) {
  const { t } = useLanguage()
  const planInfo = PLANS[currentPlan]
  const isActive = currentPlan !== 'free'

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">{t.billing.pageTitle}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t.billing.pageSubtitle}</p>
      </div>

      {successParam && (
        <div className="mb-6 rounded border border-[rgba(5,150,105,0.2)] bg-[rgba(5,150,105,0.08)] px-4 py-3">
          <p className="text-sm text-[#059669] font-medium">{t.billing.successMessage}</p>
        </div>
      )}
      {canceledParam && (
        <div className="mb-6 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <p className="text-sm text-[#134E4A]">{t.billing.canceledMessage}</p>
        </div>
      )}

      <div className="mb-8 rounded-md border border-[#E2E8F0] bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">{t.billing.currentPlan}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-900">{planInfo.label}</span>
              <span className="text-lg text-zinc-500">{planInfo.priceMonthly}{currentPlan !== 'free' ? '/mo' : ''}</span>
            </div>
            {isActive && (
              <div className="mt-1">
                <span className="inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium bg-[rgba(5,150,105,0.08)] text-[#059669] border-[rgba(5,150,105,0.2)]">
                  {t.billing.active}
                </span>
              </div>
            )}
          </div>
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

      {(currentPlan === 'free' || !isActive) && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">{t.billing.upgradePlan}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {upgradePlans.filter((p) => p !== currentPlan).map((planId) => {
              const plan = PLANS[planId]
              const priceId = stripePrices[planId] ?? null

              return (
                <div
                  key={planId}
                  className={`rounded-md border bg-white px-5 py-5 flex flex-col ${
                    planId === 'pro' ? 'border-[#0D9488] ring-1 ring-[rgba(13,148,136,0.2)]' : 'border-[#E2E8F0]'
                  }`}
                >
                  {planId === 'pro' && (
                    <span className="mb-3 self-start rounded bg-[#0D9488] px-2.5 py-0.5 text-xs font-medium text-white">
                      {t.billing.mostPopular}
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
                      <BillingActions mode="checkout" priceId={priceId} label={`${t.billing.upgradeTo} ${plan.label}`} />
                    ) : (
                      <a
                        href="mailto:info@neuridion.eu?subject=Enterprise inquiry"
                        className="block w-full rounded border border-[#E2E8F0] bg-white px-4 py-2 text-center text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors"
                      >
                        {t.billing.contactSales}
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
