import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Kodex — Automated PMS Recall Search for EU MDR',
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <span className="text-base font-bold tracking-tight text-white">Kodex</span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            Login
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero() {
  return (
    <section className="bg-zinc-900 pt-32 pb-24 px-6 text-center">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 inline-block" />
          EU MDR Article 83 compliant
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          6 hours manually.<br />
          <span className="text-blue-400">6 minutes</span> with Kodex.
        </h1>
        <p className="mt-6 text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
          EU MDR Article 83 mandates monthly recall database searches for every medical device you place on the market.
          Kodex automates BfArM, FDA, and MHRA searches — with AI-powered filtering and audit-ready PDF reports.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/30"
          >
            Start free
          </Link>
          <a
            href="#how-it-works"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-6 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------
const PAIN_CARDS = [
  {
    icon: (
      <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Manual searches take hours',
    body: 'PRRCs spend 6+ hours every month manually searching BfArM, FDA MAUDE, and MHRA databases one product at a time — time that should go to analysis, not data gathering.',
  },
  {
    icon: (
      <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    title: 'Risk of missing critical FSNs',
    body: 'A missed Field Safety Notice means a missed FSCA obligation. Human fatigue and inconsistent search methodologies create compliance gaps that regulators will find in your next audit.',
  },
  {
    icon: (
      <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: 'Audit trail gaps',
    body: 'Spreadsheets and email threads don\'t constitute an audit trail. Notified bodies and the BfArM expect documented, reproducible evidence of your PMS search activity.',
  },
]

function Problem() {
  return (
    <section className="bg-zinc-950 py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">The PMS search problem</h2>
          <p className="mt-3 text-zinc-400 max-w-xl mx-auto">
            Every medical device company with EU market access faces the same compliance burden.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {PAIN_CARDS.map((card) => (
            <div key={card.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-4">{card.icon}</div>
              <h3 className="text-base font-semibold text-white mb-2">{card.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------
const STEPS = [
  {
    number: '01',
    title: 'Create a product profile',
    body: 'Add your device name, manufacturer, EMDN code, device class, and intended use. Upload your IFU for richer AI context.',
  },
  {
    number: '02',
    title: 'Run a search',
    body: 'Pick a date range and click Run. Kodex scrapes BfArM, FDA MAUDE, and MHRA simultaneously — the AI filter classifies every result as Relevant, Uncertain, or Excluded.',
  },
  {
    number: '03',
    title: 'Download your report',
    body: 'Get a PDF and Excel report with every notice, AI rationale, confidence score, and a full audit trail. Ready for your PMS file.',
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-zinc-900 py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How it works</h2>
          <p className="mt-3 text-zinc-400 max-w-xl mx-auto">
            Three steps from profile to audit-ready report.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="flex flex-col">
              <span className="text-4xl font-black text-blue-600/40 mb-4">{step.number}</span>
              <h3 className="text-base font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
const FEATURES = [
  {
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
    title: 'BfArM + MHRA + FDA scrapers',
    body: 'Live scraping of the three major EU/UK/US recall databases. No manual downloads, no stale exports.',
  },
  {
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: 'AI-powered relevance filter',
    body: 'Claude Sonnet classifies each notice as Relevant, Uncertain, or Excluded — with a rationale and confidence score for every decision.',
  },
  {
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: 'PDF & Excel reports',
    body: 'One-click reports formatted for PMS files. Include all notices, AI decisions, rationale, and confidence — ready to drop into your technical documentation.',
  },
  {
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: 'Append-only audit log',
    body: 'Every AI decision is stored immutably. Demonstrate to your notified body exactly what was searched, when, and what conclusion was reached.',
  },
  {
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    title: 'Product profiles',
    body: 'Define each device once — device name, manufacturer, EMDN code, device class, intended use, and IFU. Every search draws on this context for more accurate filtering.',
  },
  {
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    title: 'Email notifications',
    body: 'Get notified when a search completes with a summary of relevant and uncertain notices — so nothing falls through the cracks.',
  },
]

function Features() {
  return (
    <section className="bg-zinc-950 py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Everything your PMS process needs</h2>
          <p className="mt-3 text-zinc-400 max-w-xl mx-auto">
            Built specifically for EU MDR post-market surveillance obligations.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-950 border border-blue-900">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1.5">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
const PLANS = [
  {
    id: 'free',
    label: 'Free',
    price: '€0',
    period: '',
    description: 'Try Kodex with one product.',
    features: ['1 search run', '1 product profile', 'BfArM database', 'PDF & Excel reports'],
    cta: 'Start free',
    highlight: false,
  },
  {
    id: 'starter',
    label: 'Starter',
    price: '€149',
    period: '/mo',
    description: 'For single-product manufacturers.',
    features: ['Unlimited search runs', '1 product profile', 'BfArM + MHRA + FDA', 'PDF & Excel reports', 'Email notifications'],
    cta: 'Get started',
    highlight: false,
  },
  {
    id: 'pro',
    label: 'Pro',
    price: '€499',
    period: '/mo',
    description: 'For teams managing multiple devices.',
    features: ['Unlimited search runs', '5 product profiles', 'All databases', 'PDF & Excel reports', 'Email notifications', 'Priority support'],
    cta: 'Get started',
    highlight: true,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    price: '€2,000+',
    period: '/mo',
    description: 'For large portfolios and custom needs.',
    features: ['Unlimited everything', 'Custom database integrations', 'Dedicated account manager', 'SLA agreement', 'Custom onboarding'],
    cta: 'Contact sales',
    highlight: false,
  },
]

function Pricing() {
  return (
    <section id="pricing" className="bg-zinc-900 py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Simple, transparent pricing</h2>
          <p className="mt-3 text-zinc-400 max-w-xl mx-auto">
            Start free. Upgrade when you need more searches or products.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border px-5 py-6 ${
                plan.highlight
                  ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/50'
                  : 'border-zinc-700 bg-zinc-800/60'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <p className="text-sm font-semibold text-zinc-300">{plan.label}</p>
              <div className="mt-2 flex items-end gap-0.5">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                {plan.period && <span className="mb-1 text-sm text-zinc-400">{plan.period}</span>}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{plan.description}</p>
              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {plan.id === 'enterprise' ? (
                  <a
                    href="mailto:hello@kodex.io?subject=Enterprise inquiry"
                    className="block w-full rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-zinc-600 transition-colors"
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    href="/login"
                    className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                      plan.highlight
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'border border-zinc-600 bg-zinc-700 text-white hover:bg-zinc-600'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------
const TRUST_BADGES = [
  { label: 'GDPR compliant', sub: 'Data processed in the EU' },
  { label: 'EU data residency', sub: 'Hosted on EU infrastructure' },
  { label: 'EU MDR Article 83', sub: 'Designed for PMS obligations' },
  { label: 'Append-only audit log', sub: 'Immutable decision records' },
]

function Trust() {
  return (
    <section className="bg-zinc-950 py-16 px-6 border-t border-zinc-800">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-8">
          Built for regulated industries
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TRUST_BADGES.map((badge) => (
            <div key={badge.label} className="flex flex-col items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center">
              <svg className="h-6 w-6 text-blue-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="text-sm font-semibold text-white">{badge.label}</span>
              <span className="text-xs text-zinc-500">{badge.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Footer CTA
// ---------------------------------------------------------------------------
function FooterCta() {
  return (
    <section className="bg-blue-700 py-20 px-6 text-center">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
          Start your free PMS search today
        </h2>
        <p className="mt-4 text-blue-100 text-base">
          No credit card required. One free search run included. Cancel anytime.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-bold text-blue-700 hover:bg-blue-50 transition-colors shadow-xl"
        >
          Get started free
        </Link>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function Footer() {
  return (
    <footer className="bg-zinc-900 border-t border-zinc-800 py-8 px-6">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm font-bold text-zinc-400">Kodex</span>
        <p className="text-xs text-zinc-600">
          © {new Date().getFullYear()} Kodex. Built for EU MDR compliance teams.
        </p>
        <a
          href="mailto:hello@kodex.io"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          hello@kodex.io
        </a>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/search')

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Pricing />
        <Trust />
        <FooterCta />
      </main>
      <Footer />
    </>
  )
}
