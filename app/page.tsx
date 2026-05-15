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
    desc: 'Enter device name, manufacturer, and classification. Neuridion generates optimised search terms for each regulatory database.',
  },
  {
    num: '02',
    title: 'Run a search',
    desc: 'Select date range and databases. All sources are queried in parallel. Results are deduplicated across databases.',
  },
  {
    num: '03',
    title: 'Review and export',
    desc: 'AI classifies each FSN as relevant, uncertain, or excluded. Your PRRC reviews every decision before the report is finalised.',
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
        </div>
      </nav>

      {/* Hero: centered headline + CTA + icon bullets */}
      <section className="max-w-[1080px] mx-auto px-10 pt-20 pb-10 lg:pt-28 lg:pb-14">
        <AnimatedHero>
          <div className="flex flex-col items-center text-center">
            <h1 className="text-[42px] lg:text-[56px] font-bold text-[#0F1F3D] leading-[1.1] tracking-tight mb-8 max-w-3xl">
              Post-market surveillance<br />for <span className="text-[#0D9488]">medical devices</span>
            </h1>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#0F1F3D] text-white rounded-full font-semibold text-[15px] hover:bg-[#162a4d] transition-colors mb-10"
            >
              Start 14-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <ul className="flex flex-col items-start gap-3.5 mb-10">
              {([
                { icon: Search, text: 'Search BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel' },
                { icon: Brain, text: 'AI classifies every Field Safety Notice against your device profile' },
                { icon: UserCheck, text: 'Your PRRC reviews every decision before export' },
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

      {/* Product showcase — 3 overlapping FSN cards */}
      <section className="max-w-[1100px] mx-auto px-10 pb-20 overflow-hidden">
        <div className="relative flex items-start justify-center gap-0 h-[380px]">
          <div className="relative z-10 w-[480px] flex-shrink-0 -mr-12 mt-8">
            <HeroFsnCard />
          </div>
          <div className="relative z-20 w-[340px] flex-shrink-0 hidden lg:block -mr-8">
            <div className="bg-white border border-[#dfe3ea] rounded-md overflow-hidden shadow-md">
              <div className="bg-[#f6f7f9] border-b border-[#dfe3ea] px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider">BfArM &mdash; Field Safety Notice</span>
                <span className="text-[10px] text-[#c4cad4] font-mono">BfArM/FSN-2026-0847</span>
              </div>
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-[#0F1F3D] leading-snug mb-2">FSCA: Potential battery overheating in patient monitoring system during extended use</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Device class</div><div className="text-[11px] text-[#1a2236] font-medium">Patient monitor (IIb)</div></div>
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Date issued</div><div className="text-[11px] text-[#1a2236] font-medium">12 Mar 2026</div></div>
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">FSCA type</div><div className="text-[11px] text-[#1a2236] font-medium">Safety alert + IFU update</div></div>
                  <div><div className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Risk</div><div className="text-[11px] text-[#1a2236] font-medium">Device shutdown during critical monitoring</div></div>
                </div>
              </div>
              <div className="border-t border-[#dfe3ea] px-4 py-2.5 flex items-center justify-between bg-[#f0fdf9]">
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#dcfce7] text-[#166534]">Relevant</span>
                  <span className="text-[10px] text-[#0B7C72] font-medium">Matches your device profile</span>
                </div>
                <span className="text-[10px] text-[#7a8599] font-mono">94% confidence</span>
              </div>
            </div>
          </div>
          <div className="relative z-30 w-[300px] flex-shrink-0 hidden lg:block mt-12">
            <div className="bg-white border border-[#dfe3ea] rounded-md overflow-hidden shadow-lg">
              <div className="bg-[#f6f7f9] border-b border-[#dfe3ea] px-3.5 py-2 flex items-center justify-between">
                <span className="text-[9px] font-semibold text-[#7a8599] uppercase tracking-wider">BfArM &mdash; Field Safety Notice</span>
                <span className="text-[9px] text-[#c4cad4] font-mono">BfArM/FSN-2026-0847</span>
              </div>
              <div className="px-3.5 py-2.5">
                <div className="text-[11px] font-semibold text-[#0F1F3D] leading-snug mb-1.5">FSCA: Potential battery overheating in patient monitoring system during extended use</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div><div className="text-[8px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Device class</div><div className="text-[10px] text-[#1a2236] font-medium">Patient monitor (IIb)</div></div>
                  <div><div className="text-[8px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Date issued</div><div className="text-[10px] text-[#1a2236] font-medium">12 Mar 2026</div></div>
                  <div><div className="text-[8px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">FSCA type</div><div className="text-[10px] text-[#1a2236] font-medium">Safety alert + IFU update</div></div>
                  <div><div className="text-[8px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Risk</div><div className="text-[10px] text-[#1a2236] font-medium">Device shutdown during critical monitoring</div></div>
                </div>
              </div>
              <div className="border-t border-[#dfe3ea] px-3.5 py-2 flex items-center justify-between bg-[#f0fdf9]">
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[9px] font-semibold bg-[#dcfce7] text-[#166534]">Relevant</span>
                  <span className="text-[9px] text-[#0B7C72] font-medium">Matches your device profile</span>
                </div>
                <span className="text-[9px] text-[#7a8599] font-mono">94% confidence</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Regulatory databases bar */}
      <section className="border-y border-[#dfe3ea] bg-[#f6f7f9] py-6">
        <div className="max-w-[1080px] mx-auto px-10 flex items-center justify-center flex-wrap gap-10">
          {DATABASES.map(({ tag, country }) => (
            <div key={tag} className="flex flex-col items-center gap-1 text-center">
              <span className="text-xs font-semibold font-mono text-[#0B7C72] px-3 py-0.5 bg-[#effcfa] rounded">
                {tag}
              </span>
              <span className="text-[11px] text-[#7a8599] font-medium">{country}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-[1080px] mx-auto px-10 py-24">
        <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3">How it works</p>
        <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight mb-12">Three steps to your PMS report</h2>
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
          <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3">Real classification output</p>
          <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight mb-3">Every FSN, classified against your device</h2>
          <p className="text-[15px] text-[#3d4a5c] mb-10 max-w-xl">
            Each Field Safety Notice from the search is classified by AI with a rationale your PRRC can verify. Nothing reaches the report unchecked.
          </p>
          <FsnExamples />
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-[1080px] mx-auto px-10 py-24">
        <p className="text-xs font-semibold text-[#0D9488] uppercase tracking-wider mb-3">Pricing</p>
        <h2 className="text-[28px] font-bold text-[#0F1F3D] tracking-tight mb-2">Plans for every team size</h2>
        <p className="text-sm text-[#7a8599] mb-12">14-day free trial on all plans. All prices excl. VAT.</p>
        <div className="grid md:grid-cols-3 border border-[#dfe3ea] rounded-md overflow-hidden divide-x divide-[#dfe3ea]">
          {/* Starter */}
          <div className="bg-white p-8 flex flex-col">
            <h3 className="text-sm font-semibold text-[#0F1F3D] mb-1">Starter</h3>
            <div className="mt-2">
              <span className="text-[32px] font-bold text-[#0F1F3D] tracking-tight">€199</span>
              <span className="text-[13px] text-[#7a8599]"> /mo</span>
            </div>
            <ul className="flex flex-col gap-2.5 my-6 flex-1">
              {['3 device profiles', '15 searches per month', 'PDF reports', 'Email support'].map((f) => (
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
              {['10 device profiles', '50 searches per month', 'PDF + Word reports', 'Priority support'].map((f) => (
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
        <AnimatedSection className="max-w-[1080px] mx-auto px-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1.5">
              Ready to automate your PMS workflow?
            </h2>
            <p className="text-sm text-[#7a8eab]">
              Start your free trial today. Set up your first device profile in two minutes.
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-[11px] bg-white text-[#0F1F3D] rounded font-semibold text-sm hover:bg-[#f1f5f9] transition-colors flex-shrink-0"
          >
            Start free trial
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
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
                <Link href="/contact" className="hover:text-[#0F1F3D] transition-colors">Contact</Link>
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
