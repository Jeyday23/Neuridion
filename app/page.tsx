import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowRight, Globe, Shield, Server, BadgeCheck, Search, Brain, UserCheck, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'
import { HeroFsnCard } from './components/HeroFsnCard'
import { FsnExamples } from './components/FsnExamples'
import {
  AnimatedHero, AnimatedSection,
  AnimatedStaggerGrid, AnimatedStaggerChild,
} from './components/LandingAnimations'
import { MobileNav } from './components/MobileNav'

export const metadata = {
  title: 'Neuridion — Post-Market Surveillance for Medical Device Manufacturers',
  description:
    'Automate EU MDR Article 83 post-market surveillance. Search BfArM, FDA MAUDE, MHRA, and Swissmedic. PRRC-reviewed, audit-ready reports.',
}

const DATABASES = [
  { tag: 'BfArM', country: 'Germany' },
  { tag: 'FDA MAUDE', country: 'United States' },
  { tag: 'MHRA', country: 'United Kingdom' },
  { tag: 'Swissmedic', country: 'Switzerland' },
]

const STEPS = [
  {
    num: '01',
    title: 'Define your device profile',
    desc: 'Neuridion integrates into your PMS strategy. Define your device profile or upload your predefined search strategy and product profiles.',
  },
  {
    num: '02',
    title: 'Run a search',
    desc: 'Select monitoring period and databases. All sources are queried in parallel. Results are deduplicated across databases.',
  },
  {
    num: '03',
    title: 'Review and export',
    desc: 'AI evaluates each FSN as relevant, uncertain, or excluded. Review every decision before the report is finalised. Export in various formats.',
  },
]

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/search')

  return (
    <div className="min-h-screen bg-white text-[#3d4a5c]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-[#dfe3ea]">
        <div className="max-w-[1080px] mx-auto px-10 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <NeuridionWordmark markSize={36} />
          </Link>

          <div className="hidden md:flex items-center gap-7">
            <a href="#how-it-works" className="text-[13px] text-[#7a8599] font-medium hover:text-[#0F1F3D] transition-colors">
              How It Works
            </a>
            <Link href="/pricing" className="text-[13px] text-[#7a8599] font-medium hover:text-[#0F1F3D] transition-colors">
              Pricing
            </Link>
            <Link href="/login" className="text-[13px] text-[#7a8599] font-medium hover:text-[#0F1F3D] transition-colors">
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-[13px] px-[18px] py-[7px] bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#162a4d] transition-colors"
            >
              Start free trial
            </Link>
          </div>
          <MobileNav />
        </div>
      </nav>

      {/* Hero + product showcase — full-height gradient white → teal */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-[#e6faf6] pointer-events-none" />
      <section className="relative max-w-[1080px] mx-auto px-10 pt-20 pb-10 lg:pt-28 lg:pb-14">
        <AnimatedHero>
          <div className="flex flex-col items-center text-center">
            <h1 className="text-[48px] lg:text-[64px] font-bold text-[#0F1F3D] leading-[1.08] tracking-tight mb-10 max-w-3xl">
              Post-market surveillance<br />for <span className="text-[#0D9488]">medical devices</span>
            </h1>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#0F1F3D] text-white rounded-full font-semibold text-[15px] hover:bg-[#162a4d] transition-colors mb-12"
            >
              Start 14-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <ul className="flex flex-col items-start gap-5">
              {([
                { icon: Search, text: 'Search BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel' },
                { icon: Brain, text: 'AI evaluates every Field Safety Notice against your device profile' },
                { icon: UserCheck, text: 'Review every decision with a rationale you can verify — then export in PDF, Word, or Excel' },
                { icon: FileText, text: 'Audit-ready PDF and Word reports in minutes' },
              ] as const).map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[15px] text-[#3d4a5c]">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#effcfa] flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-[#0D9488]" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </AnimatedHero>
      </section>

      {/* Product showcase — 1 large left + 2 smaller overlapping right */}
      <section className="relative max-w-[1080px] mx-auto px-10 pb-20">
        <div className="hidden lg:grid grid-cols-[1fr_40px_1fr] items-start">
          {/* Left: large FSN card */}
          <div className="relative z-10">
            <div className="bg-white border border-[#dfe3ea] rounded-lg overflow-hidden shadow-sm">
              <div className="bg-[#f6f7f9] border-b border-[#dfe3ea] px-6 py-3.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#7a8599] uppercase tracking-wider">BfArM &mdash; Field Safety Notice</span>
                <span className="text-[11px] text-[#c4cad4] font-mono">BfArM/FSN-2026-0847</span>
              </div>
              <div className="px-6 py-5">
                <div className="text-sm font-semibold text-[#0F1F3D] leading-snug mb-4">FSCA: Potential battery overheating in patient monitoring system during extended use</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div><div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Manufacturer</div><div className="text-[13px] text-[#1a2236] font-medium">Dr&auml;gerwerk AG</div></div>
                  <div><div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Device class</div><div className="text-[13px] text-[#1a2236] font-medium">Patient monitor (IIb)</div></div>
                  <div><div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Date issued</div><div className="text-[13px] text-[#1a2236] font-medium">12 Mar 2026</div></div>
                  <div><div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">FSCA type</div><div className="text-[13px] text-[#1a2236] font-medium">Safety alert + IFU update</div></div>
                </div>
              </div>
              <div className="border-t border-[#dfe3ea] px-6 py-3.5 flex items-center justify-between bg-[#f0fdf9]">
                <div className="flex items-center gap-3">
                  <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#dcfce7] text-[#166534]">Relevant</span>
                  <span className="text-xs text-[#0B7C72] font-medium">Matches your device profile</span>
                </div>
                <span className="text-[11px] text-[#7a8599] font-mono">94% confidence</span>
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div />

          {/* Right: 2 smaller cards, overlapping vertically */}
          <div className="relative mt-2">
            <div className="relative z-10 bg-white border border-[#dfe3ea] rounded-lg overflow-hidden shadow-sm">
              <div className="bg-[#f6f7f9] border-b border-[#dfe3ea] px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider">MHRA &mdash; Medical Device Alert</span>
                <span className="text-[10px] text-[#c4cad4] font-mono">MHRA/MDA-2026-014</span>
              </div>
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-[#0F1F3D] leading-snug mb-2">Infusion pump software update: risk of incorrect dose delivery in paediatric mode</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Manufacturer</div><div className="text-[11px] text-[#1a2236] font-medium">B. Braun Melsungen AG</div></div>
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Device class</div><div className="text-[11px] text-[#1a2236] font-medium">Infusion pump (IIb)</div></div>
                </div>
              </div>
              <div className="border-t border-[#dfe3ea] px-4 py-2.5 flex items-center justify-between bg-[#fffbeb]">
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fef3c7] text-[#92400e]">Uncertain</span>
                  <span className="text-[10px] text-[#b45309] font-medium">Requires further review</span>
                </div>
                <span className="text-[10px] text-[#7a8599] font-mono">62% confidence</span>
              </div>
            </div>

            <div className="relative z-20 -mt-4 ml-6 bg-white border border-[#dfe3ea] rounded-lg overflow-hidden shadow-md">
              <div className="bg-[#f6f7f9] border-b border-[#dfe3ea] px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider">FDA MAUDE &mdash; Adverse Event</span>
                <span className="text-[10px] text-[#c4cad4] font-mono">FDA/MW-10284751</span>
              </div>
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-[#0F1F3D] leading-snug mb-2">Dental implant abutment fracture reported during routine follow-up examination</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Manufacturer</div><div className="text-[11px] text-[#1a2236] font-medium">Nobel Biocare (Envista)</div></div>
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Device class</div><div className="text-[11px] text-[#1a2236] font-medium">Dental implant (III)</div></div>
                </div>
              </div>
              <div className="border-t border-[#dfe3ea] px-4 py-2.5 flex items-center justify-between bg-[#fef2f2]">
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fee2e2] text-[#991b1b]">Not Relevant</span>
                  <span className="text-[10px] text-[#dc2626] font-medium">Different device category</span>
                </div>
                <span className="text-[10px] text-[#7a8599] font-mono">97% confidence</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile fallback: single card */}
        <div className="lg:hidden flex justify-center">
          <HeroFsnCard />
        </div>
      </section>
      </div>

      {/* Unified Access — regulatory databases */}
      <section className="border-y border-[#dfe3ea] bg-[#f6f7f9] py-24">
        <div className="max-w-[1080px] mx-auto px-10">
          <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3 text-center">Unified Access</p>
          <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight text-center mb-8">Four supported databases in one interface</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 max-w-[720px] mx-auto">
            {DATABASES.map(({ tag, country }) => (
              <div key={tag} className="flex flex-col items-center justify-center gap-1.5 text-center bg-white border border-[#dfe3ea] rounded-lg py-5 shadow-sm">
                <span className="text-base font-bold font-mono text-[#0B7C72]">
                  {tag}
                </span>
                <span className="text-[11px] text-[#7a8599] font-medium">{country}</span>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-[#0D9488] font-medium text-center mt-6">...many more coming soon</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-[1080px] mx-auto px-10 py-24">
        <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3 text-center">How it works</p>
        <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight mb-12 text-center">Three steps to your PMS report</h2>
        <AnimatedStaggerGrid className="grid md:grid-cols-3 border border-[#dfe3ea] rounded-md overflow-hidden divide-x divide-[#dfe3ea]">
          {STEPS.map(({ num, title, desc }) => (
            <AnimatedStaggerChild key={num} className="p-7 bg-white">
              <div className="text-[11px] font-semibold font-mono text-[#0D9488] mb-3">{num}</div>
              <h3 className="text-[15px] font-semibold text-[#0F1F3D] mb-2">{title}</h3>
              <p className="text-[13px] text-[#7a8599] leading-relaxed">{desc}</p>
            </AnimatedStaggerChild>
          ))}
        </AnimatedStaggerGrid>
      </section>

      {/* FSN classification examples */}
      <section className="bg-[#f6f7f9] border-y border-[#dfe3ea] py-24">
        <div className="max-w-[1080px] mx-auto px-10">
          <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3 text-center">Real assessment output</p>
          <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight mb-3 text-center">Every FSN, matched against your device profile</h2>
          <p className="text-[15px] text-[#3d4a5c] mb-10 max-w-xl mx-auto text-center">
            Each Field Safety Notice from the search is evaluated by AI with a rationale you can verify and adjust. Nothing reaches the report unchecked.
          </p>
          <FsnExamples />
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-[1080px] mx-auto px-10 py-24">
        <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3 text-center">Pricing</p>
        <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight mb-2 text-center">Plans for every team size</h2>
        <p className="text-sm text-[#7a8599] mb-12 text-center">14-day free trial on all plans. All prices excl. VAT.</p>
        <div className="grid md:grid-cols-3 border border-[#dfe3ea] rounded-md overflow-hidden divide-x divide-[#dfe3ea]">
          {/* Starter */}
          <div className="bg-white p-8 flex flex-col">
            <h3 className="text-sm font-semibold text-[#0F1F3D] mb-1">Starter</h3>
            <div className="mt-2">
              <span className="text-[32px] font-bold text-[#0F1F3D] tracking-tight">€199</span>
              <span className="text-[13px] text-[#7a8599]"> /mo</span>
            </div>
            <ul className="flex flex-col gap-2.5 my-6 flex-1">
              {['3 device profiles', '15 searches per month', 'PDF, Word & Excel reports', 'Email support'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-[13px] text-[#3d4a5c]">
                  <Check className="w-3.5 h-3.5 text-[#0D9488] flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="block text-center py-2.5 border border-[#dfe3ea] text-[#3d4a5c] rounded text-[13px] font-semibold hover:border-[#7a8599] transition-colors"
            >
              Start free trial
            </Link>
          </div>

          {/* Pro */}
          <div className="bg-[#fafffe] p-8 flex flex-col">
            <h3 className="text-sm font-semibold text-[#0F1F3D] mb-1">
              Pro
              <span className="ml-2 text-[10px] font-semibold text-[#0B7C72] bg-[#effcfa] px-2 py-0.5 rounded">
                Most popular
              </span>
            </h3>
            <div className="mt-2">
              <span className="text-[32px] font-bold text-[#0F1F3D] tracking-tight">€599</span>
              <span className="text-[13px] text-[#7a8599]"> /mo</span>
            </div>
            <ul className="flex flex-col gap-2.5 my-6 flex-1">
              {['10 device profiles', '50 searches per month', 'PDF, Word & Excel reports', 'Priority support'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-[13px] text-[#3d4a5c]">
                  <Check className="w-3.5 h-3.5 text-[#0D9488] flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="block text-center py-2.5 bg-[#0F1F3D] text-white rounded text-[13px] font-semibold hover:bg-[#162a4d] transition-colors"
            >
              Start free trial
            </Link>
          </div>

          {/* Enterprise */}
          <div className="bg-white p-8 flex flex-col">
            <h3 className="text-sm font-semibold text-[#0F1F3D] mb-1">Enterprise</h3>
            <div className="mt-2">
              <span className="text-[32px] font-bold text-[#0F1F3D] tracking-tight">Custom</span>
            </div>
            <ul className="flex flex-col gap-2.5 my-6 flex-1">
              {['Unlimited profiles', 'Unlimited searches', 'SSO integration', 'Dedicated account manager'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-[13px] text-[#3d4a5c]">
                  <Check className="w-3.5 h-3.5 text-[#0D9488] flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/contact"
              className="block text-center py-2.5 border border-[#dfe3ea] text-[#3d4a5c] rounded text-[13px] font-semibold hover:border-[#7a8599] transition-colors"
            >
              Contact sales
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0F1F3D] py-20">
        <AnimatedSection className="max-w-[1080px] mx-auto px-10 flex flex-col items-center text-center gap-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">
              Ready to automate your post-market surveillance?
            </h2>
            <p className="text-sm text-[#7a8eab]">
              Start your free trial today. Set up your first device profile in two minutes.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-[11px] bg-white text-[#0F1F3D] rounded font-semibold text-sm hover:bg-[#f1f5f9] transition-colors flex-shrink-0"
            >
              Start free trial
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/sample-report"
              className="text-sm text-[#7a8eab] hover:text-white transition-colors underline underline-offset-2"
            >
              See a sample report
            </Link>
          </div>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#dfe3ea] py-10">
        <div className="max-w-[1080px] mx-auto px-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <NeuridionWordmark markSize={28} textClass="text-sm" />
            <div className="flex gap-10 text-xs text-[#7a8599]">
              <div className="flex flex-col gap-1.5">
                <Link href="/pricing" className="hover:text-[#0F1F3D] transition-colors">Pricing</Link>
                <Link href="/sample-report" className="hover:text-[#0F1F3D] transition-colors">Sample Report</Link>
                <Link href="/faq" className="hover:text-[#0F1F3D] transition-colors">FAQ</Link>
                <Link href="/contact" className="hover:text-[#0F1F3D] transition-colors">Contact</Link>
                <a href="mailto:info@neuridion.eu" className="hover:text-[#0F1F3D] transition-colors">info@neuridion.eu</a>
              </div>
              <div className="flex flex-col gap-1.5">
                <Link href="/privacy" className="hover:text-[#0F1F3D] transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-[#0F1F3D] transition-colors">Terms</Link>
                <Link href="/withdrawal" className="hover:text-[#0F1F3D] transition-colors">Withdrawal</Link>
                <Link href="/imprint" className="hover:text-[#0F1F3D] transition-colors">Imprint</Link>
                <Link href="/dpa" className="hover:text-[#0F1F3D] transition-colors">DPA</Link>
                <Link href="/ai-transparency" className="hover:text-[#0F1F3D] transition-colors">AI Transparency</Link>
                <Link href="/accessibility" className="hover:text-[#0F1F3D] transition-colors">Accessibility</Link>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-[#dfe3ea] text-[11px] text-[#c4cad4]">
            &copy; 2026 Neuridion. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
