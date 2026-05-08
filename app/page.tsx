import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  FileText,
  Download,
  Check,
  ArrowRight,
  Globe,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'
import { FaqAccordion } from './components/FaqAccordion'
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
            <a href="#how-it-works" className="hover:text-[#0F1F3D] transition-colors">
              How it works
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
      <section className="border-y border-[#CCFBF1] bg-[#F0FDFA] py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-[#0D9488]">4</div>
              <div className="text-sm text-[#134E4A] font-medium mt-1 font-medium">
                Regulatory databases
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0D9488]">
                EU MDR
              </div>
              <div className="text-sm text-[#134E4A] font-medium mt-1 font-medium">
                Art. 83 &amp; 84 compliant
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0D9488]">GDPR</div>
              <div className="text-sm text-[#134E4A] font-medium mt-1 font-medium">By design</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0D9488]">100%</div>
              <div className="text-sm text-[#134E4A] font-medium mt-1 font-medium">
                Append-only audit trail
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-4">
              Everything your PRRC needs
            </h2>
            <p className="text-[#134E4A] max-w-xl mx-auto">
              Built specifically for medical device post-market surveillance
              under EU MDR.
            </p>
          </div>

          <FeatureCards />
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-[#0F1F3D]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">
              Three steps to audit-ready PMS
            </h2>
            <p className="text-[#5EEAD4] max-w-xl mx-auto">
              From device profile to compliance report in one workflow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-0">
            {/* Step 1 */}
            <div className="relative bg-[#162a4d] border border-[#1e3a5f] rounded-l-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-[#0D9488] text-white rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0">
                  1
                </div>
                <div className="h-px flex-1 bg-[#0D9488]/30" />
              </div>
              <div className="mb-5">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="8" y="4" width="24" height="32" rx="3" stroke="#0D9488" strokeWidth="2" fill="none" />
                  <rect x="12" y="10" width="16" height="2" rx="1" fill="#5EEAD4" />
                  <rect x="12" y="16" width="12" height="2" rx="1" fill="#5EEAD4" opacity="0.7" />
                  <rect x="12" y="22" width="14" height="2" rx="1" fill="#5EEAD4" opacity="0.7" />
                  <rect x="12" y="28" width="10" height="2" rx="1" fill="#5EEAD4" opacity="0.5" />
                  <path d="M36 16L40 20L36 24" stroke="#5EEAD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Define your device profile
              </h3>
              <p className="text-sm text-[#5EEAD4] leading-relaxed">
                Enter your device name, manufacturer, intended use, and classification. Set up once — reuse across every surveillance cycle.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-[#162a4d] border-y border-[#1e3a5f] p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-[#0D9488] text-white rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0">
                  2
                </div>
                <div className="h-px flex-1 bg-[#0D9488]/30" />
              </div>
              <div className="mb-5">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="20" cy="20" r="12" stroke="#0D9488" strokeWidth="2" fill="none" />
                  <path d="M29 29L38 38" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="14" cy="18" r="3" fill="#5EEAD4" opacity="0.6" />
                  <circle cx="22" cy="14" r="2.5" fill="#5EEAD4" opacity="0.8" />
                  <circle cx="24" cy="22" r="2" fill="#5EEAD4" />
                  <path d="M14 18L22 14" stroke="#5EEAD4" strokeWidth="1" opacity="0.4" />
                  <path d="M22 14L24 22" stroke="#5EEAD4" strokeWidth="1" opacity="0.4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Run a surveillance search
              </h3>
              <p className="text-sm text-[#5EEAD4] leading-relaxed">
                Select your databases and date range. Neuridion searches in parallel, deduplicates results, and classifies each FSN against your profile.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-[#162a4d] border border-[#1e3a5f] rounded-r-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-[#0D9488] text-white rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0">
                  3
                </div>
              </div>
              <div className="mb-5">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="6" y="6" width="20" height="26" rx="2" stroke="#0D9488" strokeWidth="2" fill="none" />
                  <path d="M11 14h10M11 18h8M11 22h6" stroke="#5EEAD4" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  <rect x="10" y="26" width="6" height="3" rx="1" fill="#EF4444" />
                  <text x="11" y="28.5" fill="white" fontSize="3" fontWeight="700">PDF</text>
                  <path d="M30 12L34 16L30 20" stroke="#5EEAD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="40" cy="16" r="6" stroke="#22C55E" strokeWidth="2" fill="none" />
                  <path d="M37 16L39 18L43 14" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Review and export
              </h3>
              <p className="text-sm text-[#5EEAD4] leading-relaxed">
                Your PRRC reviews the filtered results, confirms or adjusts each classification, then exports an audit-ready PDF or Excel report.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance Detail */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold text-[#0F1F3D] mb-6">
                Built for regulatory confidence
              </h2>
              <p className="text-[#134E4A] mb-8 leading-relaxed">
                Neuridion was designed from the ground up for EU MDR
                post-market surveillance requirements. Every feature, every data
                flow, every export format serves one goal: giving your
                compliance team the tools to do their job with confidence.
              </p>

              <div className="space-y-4">
                {[
                  'EU MDR Article 83 compliant search protocols',
                  'Article 84 ready documentation and reporting',
                  'PSUR-compatible export formats',
                  'Complete, append-only audit trail',
                  'GDPR-compliant data handling',
                  'Role-based access control',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-[#F0FDF4] border border-[#BBF7D0] rounded flex items-center justify-center mt-0.5 flex-shrink-0">
                      <Check className="w-3 h-3 text-[#166534]" />
                    </div>
                    <span className="text-sm text-[#134E4A] font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-8">
              <h3 className="text-lg font-semibold text-[#0F1F3D] mb-6">
                Database coverage
              </h3>
              <div className="space-y-5">
                {[
                  {
                    name: 'BfArM',
                    region: 'Germany',
                    type: 'Kundeninfo portal',
                  },
                  {
                    name: 'FDA MAUDE',
                    region: 'United States',
                    type: 'Device event reports',
                  },
                  {
                    name: 'MHRA',
                    region: 'United Kingdom',
                    type: 'Medical device alerts',
                  },
                  {
                    name: 'Swissmedic',
                    region: 'Switzerland',
                    type: 'FSCA reports',
                  },
                ].map((db) => (
                  <div
                    key={db.name}
                    className="flex items-start gap-3 pb-5 border-b border-[#E2E8F0] last:border-0 last:pb-0"
                  >
                    <Globe className="w-4 h-4 text-[#0D9488] mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#0F1F3D]">
                        {db.name}{' '}
                        <span className="text-[#0D9488] font-normal">
                          — {db.region}
                        </span>
                      </div>
                      <div className="text-xs text-[#0D9488] mt-0.5">
                        {db.type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-[#134E4A]">
              14-day free trial on all plans. No credit card required.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Starter */}
            <div className="bg-white border border-[#E2E8F0] rounded p-8 flex flex-col">
              <div className="mb-1">
                <span className="text-xs font-medium text-[#0D9488]">
                  14-day free trial
                </span>
              </div>
              <h3 className="text-xl font-semibold text-[#0F1F3D] mb-1">
                Starter
              </h3>
              <div className="mb-6">
                <span className="text-3xl font-bold text-[#0F1F3D]">€199</span>
                <span className="text-[#0D9488]">/month</span>
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
                <span className="text-[#0D9488]">/month</span>
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
                <span className="text-3xl font-bold text-[#0F1F3D]">
                  Custom
                </span>
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

      {/* FAQ */}
      <section className="py-24">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-[#0F1F3D] mb-12">
            Frequently asked questions
          </h2>
          <FaqAccordion />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0F1F3D]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to simplify your PMS workflow?
          </h2>
          <p className="text-[#0D9488] mb-8 max-w-lg mx-auto">
            Join medical device manufacturers who trust Neuridion for their
            post-market surveillance obligations.
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
      <footer className="bg-white border-t border-[#E2E8F0] py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">
                Product
              </h4>
              <ul className="space-y-2 text-sm text-[#134E4A]">
                <li>
                  <a href="#features" className="hover:text-[#0F1F3D]">
                    Features
                  </a>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-[#0F1F3D]">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">
                Company
              </h4>
              <ul className="space-y-2 text-sm text-[#134E4A]">
                <li>
                  <a
                    href="mailto:info.kodex.medical@gmail.com"
                    className="hover:text-[#0F1F3D]"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">
                Legal
              </h4>
              <ul className="space-y-2 text-sm text-[#134E4A]">
                <li>
                  <Link href="/privacy" className="hover:text-[#0F1F3D]">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[#0F1F3D]">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="/imprint" className="hover:text-[#0F1F3D]">
                    Imprint
                  </Link>
                </li>
                <li>
                  <Link href="/dpa" className="hover:text-[#0F1F3D]">
                    DPA
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[#0F1F3D] mb-3">
                Connect
              </h4>
              <ul className="space-y-2 text-sm text-[#134E4A]">
                <li>
                  <a href="#" className="hover:text-[#0F1F3D]">
                    LinkedIn
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#E2E8F0] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#0D9488]">
            <span>&copy; 2026 Neuridion. All rights reserved.</span>
            <span>Built for PRRCs, by people who understand MDR.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
