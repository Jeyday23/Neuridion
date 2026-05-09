import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'
import { AnimatedHero } from './components/AnimatedHero'
import { FeatureCards } from './components/FeatureCards'

export const metadata = {
  title: 'Neuridion — Post-Market Surveillance for Medical Device Manufacturers',
  description:
    'Automate EU MDR Article 83 post-market surveillance. Search BfArM, FDA MAUDE, MHRA, and Swissmedic. PRRC-reviewed, audit-ready reports.',
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/search')

  return (
    <div className="min-h-screen bg-white text-[#1E293B]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <NeuridionWordmark markSize={36} />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-[#134E4A]">
            <a href="#features" className="hover:text-[#0F1F3D] transition-colors">
              Features
            </a>
            <Link href="/pricing" className="hover:text-[#0F1F3D] transition-colors">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-[#134E4A] hover:text-[#0F1F3D] transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm px-4 py-2 bg-[#0F1F3D] text-white rounded hover:bg-[#1a2d52] transition-colors font-medium"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <AnimatedHero />

      {/* Trust Bar */}
      <section className="border-y border-[#CCFBF1] bg-[#F0FDFA] py-8">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-center">
            <div>
              <div className="text-xl font-bold text-[#0D9488]">4 databases</div>
              <div className="text-xs text-[#134E4A] font-medium mt-1">
                Searched in parallel
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#0D9488]">EU MDR</div>
              <div className="text-xs text-[#134E4A] font-medium mt-1">
                Art. 83 compliant
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#0D9488]">GDPR</div>
              <div className="text-xs text-[#134E4A] font-medium mt-1">By design</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">
              Everything your PRRC needs
            </h2>
            <p className="text-[#134E4A] max-w-lg mx-auto">
              Built for medical device post-market surveillance under EU MDR.
            </p>
          </div>

          <FeatureCards />
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">
              Simple pricing
            </h2>
            <p className="text-[#134E4A]">
              14-day free trial. No credit card required.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Starter */}
            <div className="bg-white border border-[#E2E8F0] rounded p-8 flex flex-col">
              <h3 className="text-xl font-semibold text-[#0F1F3D] mb-1">
                Starter
              </h3>
              <div className="mb-6">
                <span className="text-3xl font-bold text-[#0F1F3D]">€199</span>
                <span className="text-[#0D9488]">/mo</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {[
                  '3 device profiles',
                  '15 searches/month',
                  'PDF reports',
                  'Email support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#134E4A] font-medium">
                    <Check className="w-4 h-4 text-[#0D9488] flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="block w-full text-center py-2.5 border border-[#E2E8F0] text-[#134E4A] rounded text-sm font-medium hover:border-[#CBD5E1] transition-colors"
              >
                Start free trial
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-white border-2 border-[#0F1F3D] rounded p-8 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0F1F3D] text-white px-3 py-0.5 rounded text-xs font-medium">
                Most popular
              </div>
              <h3 className="text-xl font-semibold text-[#0F1F3D] mb-1">
                Pro
              </h3>
              <div className="mb-6">
                <span className="text-3xl font-bold text-[#0F1F3D]">€599</span>
                <span className="text-[#0D9488]">/mo</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {[
                  '10 device profiles',
                  '50 searches/month',
                  'PDF + Excel reports',
                  'Priority support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#134E4A] font-medium">
                    <Check className="w-4 h-4 text-[#0D9488] flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="block w-full text-center py-2.5 bg-[#0F1F3D] text-white rounded text-sm font-medium hover:bg-[#1a2d52] transition-colors"
              >
                Start free trial
              </Link>
            </div>

            {/* Enterprise */}
            <div className="bg-white border border-[#E2E8F0] rounded p-8 flex flex-col">
              <h3 className="text-xl font-semibold text-[#0F1F3D] mb-1">
                Enterprise
              </h3>
              <div className="mb-6">
                <span className="text-3xl font-bold text-[#0F1F3D]">Custom</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {[
                  'Unlimited profiles',
                  'Unlimited searches',
                  'SSO integration',
                  'Dedicated account manager',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#134E4A] font-medium">
                    <Check className="w-4 h-4 text-[#0D9488] flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:info.kodex.medical@gmail.com"
                className="block w-full text-center py-2.5 border border-[#E2E8F0] text-[#134E4A] rounded text-sm font-medium hover:border-[#CBD5E1] transition-colors"
              >
                Contact sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#0F1F3D]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to automate your PMS?
          </h2>
          <p className="text-[#5EEAD4] mb-6">
            Start your free trial today. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#0F1F3D] rounded font-medium hover:bg-[#F1F5F9] transition-colors"
          >
            Start 14-day free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#E2E8F0] py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <NeuridionWordmark markSize={28} textClass="text-sm" />
            <div className="flex gap-12 text-sm text-[#134E4A]">
              <div className="space-y-2">
                <Link href="/pricing" className="block hover:text-[#0F1F3D]">Pricing</Link>
                <a href="mailto:info.kodex.medical@gmail.com" className="block hover:text-[#0F1F3D]">Contact</a>
              </div>
              <div className="space-y-2">
                <Link href="/privacy" className="block hover:text-[#0F1F3D]">Privacy</Link>
                <Link href="/terms" className="block hover:text-[#0F1F3D]">Terms</Link>
                <Link href="/imprint" className="block hover:text-[#0F1F3D]">Imprint</Link>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-[#E2E8F0] text-xs text-[#0D9488]">
            &copy; 2026 Neuridion. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
