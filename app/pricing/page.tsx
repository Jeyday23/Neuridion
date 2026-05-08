import Link from 'next/link'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Pricing — Neuridion',
}

const tiers = [
  {
    name: 'Starter',
    price: '€149',
    suffix: '/month',
    badge: '14-day free trial',
    features: [
      '1 device profile',
      '10 searches/month',
      'PDF reports',
      'Email support',
    ],
    highlighted: false,
    cta: { loggedIn: '/dashboard/billing', loggedOut: '/signup' },
    ctaLabel: 'Start free trial',
  },
  {
    name: 'Pro',
    price: '€499',
    suffix: '/month',
    badge: 'Most popular',
    features: [
      '5 device profiles',
      '50 searches/month',
      'PDF + Excel reports',
      'Priority support',
    ],
    highlighted: true,
    cta: { loggedIn: '/dashboard/billing', loggedOut: '/signup' },
    ctaLabel: 'Start free trial',
  },
  {
    name: 'Enterprise',
    price: '€5,000+',
    suffix: '/month',
    badge: null,
    features: [
      'Unlimited profiles',
      'Unlimited searches',
      'SSO integration',
      'Dedicated account manager',
    ],
    highlighted: false,
    cta: { loggedIn: null, loggedOut: null },
    ctaLabel: 'Contact sales',
    ctaHref: 'mailto:info.kodex.medical@gmail.com',
  },
] as const

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#0F1F3D] border-b border-[#0F1F3D]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-white text-xl font-bold">
            Neuridion
          </Link>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link
                href="/dashboard/search"
                className="px-6 py-2 bg-[#0D9488] text-white rounded hover:bg-[#0F766E] transition-colors font-medium"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-white hover:text-[#0D9488] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="px-6 py-2 bg-[#0D9488] text-white rounded hover:bg-[#0F766E] transition-colors font-medium"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-4xl font-bold text-[#0F1F3D] mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="bg-white pb-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {tiers.map((tier) => {
              const isEnterprise = 'ctaHref' in tier
              const href = isEnterprise
                ? tier.ctaHref
                : isLoggedIn
                  ? tier.cta.loggedIn
                  : tier.cta.loggedOut

              return (
                <div
                  key={tier.name}
                  className={`bg-white rounded-md p-8 flex flex-col relative ${
                    tier.highlighted
                      ? 'border-2 border-[#0D9488]'
                      : 'border border-[#E2E8F0]'
                  }`}
                >
                  {/* Badge */}
                  {tier.badge && (
                    tier.highlighted ? (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#0D9488] text-white px-4 py-1 rounded text-sm font-medium">
                        {tier.badge}
                      </div>
                    ) : (
                      <div className="mb-4">
                        <span className="inline-block text-xs font-medium text-[#0D9488] border border-[#0D9488] px-2 py-0.5 rounded">
                          {tier.badge}
                        </span>
                      </div>
                    )
                  )}

                  {/* Plan name */}
                  <h3 className="text-2xl font-semibold text-[#0F1F3D] mb-2">
                    {tier.name}
                  </h3>

                  {/* Price */}
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-[#0F1F3D]">
                      {tier.price}
                    </span>
                    <span className="text-[#6B7280]">{tier.suffix}</span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-3 text-[#6B7280]"
                      >
                        <Check className="w-5 h-5 text-[#0D9488] flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {href && (
                    <Link
                      href={href}
                      className={`block w-full text-center px-6 py-3 rounded font-medium transition-colors ${
                        tier.highlighted
                          ? 'bg-[#0D9488] text-white hover:bg-[#0F766E]'
                          : 'border border-[#E2E8F0] text-[#374151] hover:border-[#0D9488] hover:text-[#0D9488]'
                      }`}
                    >
                      {tier.ctaLabel}
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Product</h4>
              <ul className="space-y-2 text-slate-600">
                <li><Link href="/" className="hover:text-[#0D9488]">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-[#0D9488]">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Company</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="mailto:info.kodex.medical@gmail.com" className="hover:text-[#0D9488]">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Legal</h4>
              <ul className="space-y-2 text-slate-600">
                <li><Link href="/privacy" className="hover:text-[#0D9488]">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-[#0D9488]">Terms</Link></li>
                <li><Link href="/imprint" className="hover:text-[#0D9488]">Imprint</Link></li>
                <li><Link href="/dpa" className="hover:text-[#0D9488]">DPA</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Social</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-[#0D9488]">LinkedIn</a></li>
                <li><a href="#" className="hover:text-[#0D9488]">Twitter</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-200 text-center text-slate-500">
            &copy; 2026 Neuridion. Built for PRRCs.
          </div>
        </div>
      </footer>
    </div>
  )
}
