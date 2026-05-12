import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowRight, Shield, Lock, FileCheck, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'
import { FaqAccordion } from './components/FaqAccordion'
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
            <a href="#how-it-works" className="hover:text-[#0F1F3D] transition-colors">
              How It Works
            </a>
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
      <section className="py-16 lg:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-[1fr_420px] gap-12 items-center">
            {/* Left — copy */}
            <div>
              <span className="inline-block px-4 py-1.5 bg-[#CCFBF1] text-[#115E59] text-sm font-semibold rounded-full border border-[#0D9488] mb-6">
                AI-Powered PMS Platform
              </span>
              <h1 className="text-4xl md:text-5xl font-bold text-[#0F1F3D] tracking-tight mb-5">
                PMS Reports in Minutes, Not Days
              </h1>
              <p className="text-lg leading-relaxed text-[#134E4A] font-medium mb-8 max-w-lg">
                Search BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel. AI filters every Field Safety Notice against your device profile. Export audit-ready PDF reports.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#1a2d52] transition-colors text-sm"
              >
                Start 14-day free trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-[#0F766E] mt-3">
                No credit card required &middot; Cancel anytime
              </p>
            </div>
            {/* Right — mini product preview */}
            <div className="hidden lg:block">
              <div className="rounded-lg border border-[#E2E8F0] shadow-md overflow-hidden bg-white">
                <div className="bg-[#F1F5F9] border-b border-[#E2E8F0] px-3 py-2 flex items-center gap-1.5">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-[#E2E8F0]" />
                    <div className="w-2 h-2 rounded-full bg-[#E2E8F0]" />
                    <div className="w-2 h-2 rounded-full bg-[#E2E8F0]" />
                  </div>
                  <div className="flex-1 text-center text-[10px] text-[#94A3B8]">neuridion.eu</div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-semibold text-[#0F1F3D] mb-3">Search Results</div>
                  <div className="flex gap-3 mb-3">
                    <div className="flex items-center gap-1 text-[10px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      <span className="font-semibold text-[#0F1F3D]">12</span>
                      <span className="text-[#64748B]">relevant</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                      <span className="font-semibold text-[#0F1F3D]">3</span>
                      <span className="text-[#64748B]">uncertain</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
                      <span className="font-semibold text-[#0F1F3D]">45</span>
                      <span className="text-[#64748B]">excluded</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { title: 'Battery overheating in cardiac monitor', src: 'BfArM', conf: 94 },
                      { title: 'Updated IFU for patient cable assembly', src: 'MHRA', conf: 87 },
                      { title: 'Software update v3.2 — display calibration', src: 'FDA', conf: 82 },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-[#FAFBFC] text-[10px]">
                        <div className="truncate text-[#0F1F3D] font-medium mr-2">{row.title}</div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[#64748B]">{row.src}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#D1FAE5] text-[#065F46] font-semibold text-[9px]">
                            {row.conf}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
                Art. 83 ready
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#0D9488]">GDPR</div>
              <div className="text-xs text-[#134E4A] font-medium mt-1">By design</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-6 pt-5 border-t border-[#CCFBF1]">
            {['EU MDR Art. 83', 'GDPR', 'ISO 13485', 'Append-Only Audit Trail'].map((badge) => (
              <span key={badge} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E2E8F0] rounded-full text-xs font-medium text-[#0F1F3D]">
                <Shield className="w-3 h-3 text-[#0D9488]" />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Product Preview */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-lg border border-[#E2E8F0] shadow-lg overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-[#F1F5F9] border-b border-[#E2E8F0] px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
                <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
                <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
              </div>
              <div className="flex-1 text-center text-xs text-[#94A3B8] font-medium">
                neuridion.eu/dashboard/archive
              </div>
            </div>
            {/* Dashboard mockup */}
            <div className="flex bg-white min-h-[420px]">
              {/* Sidebar */}
              <div className="w-48 bg-[#0F1F3D] p-4 hidden md:block">
                <div className="text-white font-semibold text-sm mb-6 tracking-tight">Neuridion</div>
                <nav className="space-y-1">
                  {['Search', 'Archive', 'Profiles', 'Settings'].map((item, i) => (
                    <div
                      key={item}
                      className={`px-3 py-2 rounded text-xs font-medium ${
                        i === 1
                          ? 'bg-white/10 text-white'
                          : 'text-white/50'
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </nav>
              </div>
              {/* Main content */}
              <div className="flex-1 p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-[#0F1F3D]">CardioMonitor Pro — Search Results</div>
                    <div className="text-xs text-[#64748B] mt-0.5">BfArM, FDA MAUDE, MHRA, Swissmedic &middot; Jan 2026 – Apr 2026</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-2.5 py-1 bg-[#F0FDFA] border border-[#0D9488] rounded text-xs font-medium text-[#0D9488]">Export PDF</div>
                  </div>
                </div>
                {/* Stats bar */}
                <div className="flex gap-4 mb-4">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                    <span className="font-semibold text-[#0F1F3D]">12</span>
                    <span className="text-[#64748B]">relevant</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                    <span className="font-semibold text-[#0F1F3D]">3</span>
                    <span className="text-[#64748B]">uncertain</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                    <span className="font-semibold text-[#0F1F3D]">45</span>
                    <span className="text-[#64748B]">excluded</span>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 mb-3 border-b border-[#E2E8F0]">
                  {[
                    { label: 'Relevant', count: 12, active: true },
                    { label: 'Uncertain', count: 3, active: false },
                    { label: 'Excluded', count: 45, active: false },
                  ].map(({ label, count, active }) => (
                    <div
                      key={label}
                      className={`px-3 py-2 text-xs font-medium ${
                        active
                          ? 'text-[#0F1F3D] border-b-2 border-[#0D9488]'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      {label} <span className={active ? 'text-[#0D9488]' : ''}>{count}</span>
                    </div>
                  ))}
                </div>
                {/* Results table */}
                <div className="border border-[#E2E8F0] rounded overflow-hidden text-xs">
                  <div className="grid grid-cols-[1fr_120px_80px_80px_90px] bg-[#F8FAFC] border-b border-[#E2E8F0] font-semibold text-[#64748B] px-3 py-2 hidden sm:grid">
                    <div>Title</div>
                    <div>Manufacturer</div>
                    <div>Date</div>
                    <div>Source</div>
                    <div>Decision</div>
                  </div>
                  {[
                    { title: 'FSN — Battery overheating in cardiac monitor', mfr: 'Medtronic', date: '12 Mar 2026', src: 'BfArM', decision: 'Relevant', conf: 94, color: 'bg-[#D1FAE5] text-[#065F46]' },
                    { title: 'Updated IFU for patient cable assembly', mfr: 'Philips', date: '28 Feb 2026', src: 'MHRA', decision: 'Relevant', conf: 87, color: 'bg-[#D1FAE5] text-[#065F46]' },
                    { title: 'Software update v3.2 — display calibration', mfr: 'GE Healthcare', date: '15 Feb 2026', src: 'FDA', decision: 'Relevant', conf: 82, color: 'bg-[#D1FAE5] text-[#065F46]' },
                    { title: 'Sensor probe connector recall', mfr: 'Siemens', date: '03 Jan 2026', src: 'Swissmedic', decision: 'Relevant', conf: 79, color: 'bg-[#D1FAE5] text-[#065F46]' },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_80px_80px_90px] px-3 py-2.5 border-b border-[#F1F5F9] hover:bg-[#FAFBFC] items-center gap-1 sm:gap-0">
                      <div className="font-medium text-[#0F1F3D] truncate">{row.title}</div>
                      <div className="text-[#64748B] hidden sm:block">{row.mfr}</div>
                      <div className="text-[#64748B] hidden sm:block">{row.date}</div>
                      <div className="text-[#64748B] hidden sm:block">{row.src}</div>
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${row.color}`}>
                          {row.decision} {row.conf}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">How it works</h2>
            <p className="text-[#134E4A]">Three steps from device profile to audit-ready report.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Define your device profile',
                desc: 'Enter your device name, manufacturer, and classification. Neuridion builds optimized search terms automatically.',
              },
              {
                step: '2',
                title: 'Run a search',
                desc: 'Select databases and date range. Neuridion searches BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel.',
              },
              {
                step: '3',
                title: 'Review and export',
                desc: 'AI classifies each result. Your PRRC reviews the decisions, then exports a PDF report ready for your next audit.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#0F1F3D] text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                  {step}
                </div>
                <h3 className="text-base font-semibold text-[#0F1F3D] mb-2">{title}</h3>
                <p className="text-sm text-[#134E4A] leading-relaxed font-medium">{desc}</p>
              </div>
            ))}
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

      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">
              Frequently asked questions
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-20 bg-white border-y border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">
              Security &amp; compliance
            </h2>
            <p className="text-[#134E4A]">
              Built for regulated industries from day one.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                Icon: Shield,
                title: 'GDPR by design',
                desc: 'All data processed and stored in the EU. Encryption at rest and in transit.',
              },
              {
                Icon: FileCheck,
                title: 'Append-only audit trail',
                desc: 'Every action logged immutably. Full traceability for regulatory audits.',
              },
              {
                Icon: Lock,
                title: 'Role-based access',
                desc: 'PRRC review gate ensures no AI decision reaches your report unchecked.',
              },
              {
                Icon: Trash2,
                title: 'Data minimization',
                desc: 'We collect only what’s needed. Account deletion with full data purge on request.',
              },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-5 rounded border border-[#E2E8F0] hover:border-[#0D9488] transition-colors">
                <Icon className="w-6 h-6 text-[#0D9488] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-[#0F1F3D] mb-1">{title}</h3>
                  <p className="text-sm text-[#134E4A] leading-relaxed font-medium">{desc}</p>
                </div>
              </div>
            ))}
          </div>
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
                <span className="text-[#0F766E]">/mo</span>
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
                <span className="text-[#0F766E]">/mo</span>
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
              <Link
                href="/contact"
                className="block w-full text-center py-2.5 border border-[#E2E8F0] text-[#134E4A] rounded text-sm font-medium hover:border-[#CBD5E1] transition-colors"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#0F1F3D]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to streamline your post-market surveillance?
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
                <Link href="/contact" className="block hover:text-[#0F1F3D]">Contact</Link>
              </div>
              <div className="space-y-2">
                <Link href="/privacy" className="block hover:text-[#0F1F3D]">Privacy</Link>
                <Link href="/terms" className="block hover:text-[#0F1F3D]">Terms</Link>
                <Link href="/imprint" className="block hover:text-[#0F1F3D]">Imprint</Link>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-[#E2E8F0] text-xs text-[#0F766E]">
            &copy; 2026 Neuridion. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
