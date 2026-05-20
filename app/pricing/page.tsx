import Link from 'next/link'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'

export const metadata = {
  title: 'Pricing — Neuridion',
}

const tiers = [
  {
    name: 'Starter',
    price: '€199',
    suffix: '/month',
    badge: '14-day free trial',
    features: [
      '3 device profiles',
      '15 searches/month',
      'PDF, Word & Excel reports',
      'Email support',
    ],
    highlighted: false,
    cta: { loggedIn: '/dashboard/billing', loggedOut: '/signup' },
    ctaLabel: 'Start free trial',
  },
  {
    name: 'Pro',
    price: '€599',
    suffix: '/month',
    badge: 'Most popular',
    features: [
      '10 device profiles',
      '50 searches/month',
      'PDF, Word & Excel reports',
      'Priority support',
    ],
    highlighted: true,
    cta: { loggedIn: '/dashboard/billing', loggedOut: '/signup' },
    ctaLabel: 'Start free trial',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    suffix: '',
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
    ctaHref: '/contact',
  },
] as const

export default async function PricingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div className="min-h-screen bg-white text-[#1E293B]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <NeuridionWordmark markSize={36} />
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                href="/dashboard/search"
                className="text-sm px-4 py-2 bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#1a2d52] transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-[#0F766E] hover:text-[#0F1F3D] transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm px-4 py-2 bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#1a2d52] transition-colors"
                >
                  Start free trial
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-3xl font-bold text-[#0F1F3D] mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-[#0F766E] max-w-lg mx-auto">
            All plans include a 14-day free trial. No credit card required.
          </p>
          <p className="text-xs text-[#94A3B8] mt-2">All prices excl. VAT (zzgl. MwSt.)</p>
          <p className="text-xs text-[#94A3B8] mt-1">1 search = all selected databases for one device profile and date range</p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
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
                  className={`bg-white rounded p-8 flex flex-col relative ${
                    tier.highlighted
                      ? 'border-2 border-[#0F1F3D]'
                      : 'border border-[#E2E8F0]'
                  }`}
                >
                  {tier.badge &&
                    (tier.highlighted ? (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0F1F3D] text-white px-3 py-0.5 rounded text-xs font-medium">
                        {tier.badge}
                      </div>
                    ) : (
                      <div className="mb-3">
                        <span className="text-xs font-medium text-[#0D9488]">
                          {tier.badge}
                        </span>
                      </div>
                    ))}

                  <h3 className="text-xl font-semibold text-[#0F1F3D] mb-1">
                    {tier.name}
                  </h3>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-[#0F1F3D]">
                      {tier.price}
                    </span>
                    {tier.suffix && (
                      <span className="text-[#0D9488]">{tier.suffix}</span>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-sm text-[#0F766E]"
                      >
                        <Check className="w-4 h-4 text-[#0D9488] flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {href && (
                    <Link
                      href={href}
                      className={`block w-full text-center py-2.5 rounded text-sm font-medium transition-colors ${
                        tier.highlighted
                          ? 'bg-[#0F1F3D] text-white hover:bg-[#1a2d52]'
                          : 'border border-[#E2E8F0] text-[#134E4A] hover:border-[#CBD5E1]'
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
      <footer className="bg-white border-t border-[#E2E8F0] py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-[#0F766E]">
                <li><Link href="/" className="hover:text-[#0F1F3D]">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-[#0F1F3D]">Pricing</Link></li>
                <li><Link href="/sample-report" className="hover:text-[#0F1F3D]">Sample Report</Link></li>
                <li><Link href="/faq" className="hover:text-[#0F1F3D]">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-[#0F766E]">
                <li><Link href="/contact" className="hover:text-[#0F1F3D]">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-[#0F766E]">
                <li><Link href="/privacy" className="hover:text-[#0F1F3D]">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-[#0F1F3D]">Terms</Link></li>
                <li><Link href="/imprint" className="hover:text-[#0F1F3D]">Imprint</Link></li>
                <li><Link href="/dpa" className="hover:text-[#0F1F3D]">DPA</Link></li>
                <li><Link href="/ai-transparency" className="hover:text-[#0F1F3D]">AI Transparency</Link></li>
                <li><Link href="/accessibility" className="hover:text-[#0F1F3D]">Accessibility</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">Connect</h4>
              <ul className="space-y-2 text-sm text-[#0F766E]">
                <li><a href="#" className="hover:text-[#0F1F3D]">LinkedIn</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#E2E8F0] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#0D9488]">
            <span>&copy; 2026 Neuridion. All rights reserved.</span>
            <span>Built for PRRCs (Persons Responsible for Regulatory Compliance), by people who understand MDR.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
