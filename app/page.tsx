import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, FileText, Download, Shield, CheckCircle, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FaqAccordion } from './components/FaqAccordion'
import { HeroVapourText } from './components/HeroVapourText'

export const metadata = {
  title: 'Neuridion — PMS Compliance in Minutes, Not Days',
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/search')

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-50 bg-[#0F1F3D] border-b border-[#0F1F3D]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-white text-xl font-bold">Neuridion</div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-white hover:text-[#0D9488] transition-colors">
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-6 py-2 bg-[#0D9488] text-white rounded hover:bg-[#0F766E] transition-colors font-medium"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen bg-[#0F1F3D] text-white flex items-center relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-32 text-center w-full relative z-10">
          <div className="h-28 md:h-36 mb-8 flex items-center justify-center">
            <HeroVapourText />
          </div>

          <p className="text-xl md:text-2xl text-slate-300 mb-4 max-w-3xl mx-auto leading-relaxed">
            AI searches 4 regulatory databases and filters Field Safety Notices for your device. Your PRRC reviews and approves. Audit-ready reports, instantly.
          </p>

          <p className="text-sm md:text-base text-[#0D9488] mb-12 font-mono tracking-wide">
            Currently in beta &nbsp;·&nbsp; Public launch June 2026
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/signup"
              className="px-8 py-4 bg-[#0D9488] hover:bg-[#0F766E] text-white font-medium rounded transition-colors"
            >
              Start 14-day free trial
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 border border-white/20 hover:border-[#0D9488] text-white rounded transition-colors font-medium"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-white py-16 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-slate-500 mb-8">Built for EU MDR Article 83 compliance</p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-[#F8FAFC] rounded-md border border-[#E2E8F0]">
              <div className="w-16 h-16 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center">
                <Shield className="w-8 h-8 text-[#0D9488]" />
              </div>
              <div className="font-bold text-slate-900 text-lg">EU MDR Art. 83</div>
              <div className="text-xs text-slate-500">Compliant workflow</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-[#F8FAFC] rounded-md border border-[#E2E8F0]">
              <div className="w-16 h-16 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center">
                <Lock className="w-8 h-8 text-[#0D9488]" />
              </div>
              <div className="font-bold text-slate-900 text-lg">GDPR</div>
              <div className="text-xs text-slate-500">By design</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-[#F8FAFC] rounded-md border border-[#E2E8F0]">
              <div className="w-16 h-16 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center">
                <FileText className="w-8 h-8 text-[#0D9488]" />
              </div>
              <div className="font-bold text-slate-900 text-lg">Audit trail</div>
              <div className="text-xs text-slate-500">Append-only</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-[#F8FAFC] rounded-md border border-[#E2E8F0]">
              <div className="w-16 h-16 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-[#0D9488]" />
              </div>
              <div className="font-bold text-slate-900 text-lg">AI + human</div>
              <div className="text-xs text-slate-500">PRRC review gate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-16 text-slate-900">
            Everything you need for MDR Article 83
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-md">
              <div className="w-12 h-12 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center mb-6">
                <Search className="w-6 h-6 text-[#0D9488]" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-[#0F1F3D]">4 regulatory databases</h3>
              <p className="text-[#6B7280]">BfArM, FDA MAUDE, MHRA, and Swissmedic — searched automatically in parallel</p>
            </div>
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-md">
              <div className="w-12 h-12 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-[#0D9488]" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-[#0F1F3D]">AI-powered filtering</h3>
              <p className="text-[#6B7280]">AI classifies each Field Safety Notice as relevant, uncertain, or excluded. Your PRRC reviews before anything ships.</p>
            </div>
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-md">
              <div className="w-12 h-12 bg-[rgba(13,148,136,0.08)] rounded-md flex items-center justify-center mb-6">
                <FileText className="w-6 h-6 text-[#0D9488]" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-[#0F1F3D]">Audit-ready reports</h3>
              <p className="text-[#6B7280]">PDF and Excel reports formatted for EU MDR compliance. Complete audit trail with timestamps.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-16 text-slate-900">
            From profile to report in 3 steps
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D9488] text-white rounded-md flex items-center justify-center mx-auto mb-6 text-2xl font-medium">1</div>
              <FileText className="w-8 h-8 text-[#0D9488] mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3 text-[#0F1F3D]">Create a device profile</h3>
              <p className="text-[#6B7280]">Define your device characteristics and search terms</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D9488] text-white rounded-md flex items-center justify-center mx-auto mb-6 text-2xl font-medium">2</div>
              <Search className="w-8 h-8 text-[#0D9488] mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3 text-[#0F1F3D]">Run automated search</h3>
              <p className="text-[#6B7280]">Search across databases automatically with AI filtering</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0D9488] text-white rounded-md flex items-center justify-center mx-auto mb-6 text-2xl font-medium">3</div>
              <Download className="w-8 h-8 text-[#0D9488] mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-3 text-[#0F1F3D]">Download audit-ready report</h3>
              <p className="text-[#6B7280]">Get MDR-compliant documentation ready for audits</p>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="bg-[#0F1F3D] text-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-16">Built for EU MDR compliance</h2>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <ul className="space-y-4">
                {[
                  'Article 83 compliant search protocols',
                  'Article 84 ready documentation',
                  'PSUR-ready export formats',
                  'Complete audit trail with timestamps',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-[#0D9488] rounded-md flex items-center justify-center mt-1 flex-shrink-0">
                      <span className="text-white text-sm">✓</span>
                    </div>
                    <span className="text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#0F1F3D] border border-white/10 rounded-md h-80 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <Shield className="w-24 h-24 mx-auto mb-4 text-[#0D9488]" />
                <p className="text-lg font-semibold text-white">EU MDR Art. 83 Compliant</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-16 text-slate-900">
            Simple pricing for every team
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-md">
              <p className="text-sm text-[#0D9488] font-medium mb-2">14-day free trial</p>
              <h3 className="text-2xl font-semibold mb-2 text-[#0F1F3D]">Starter</h3>
              <div className="mb-6"><span className="text-4xl font-bold text-[#0F1F3D]">€149</span><span className="text-[#6B7280]">/month</span></div>
              <ul className="space-y-3 mb-8 text-[#6B7280]"><li>1 device profile</li><li>10 searches/month</li><li>PDF reports</li><li>Email support</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 border border-[#E2E8F0] text-[#374151] rounded hover:border-[#0D9488] hover:text-[#0D9488] transition-colors">Start free trial</Link>
            </div>
            <div className="p-8 bg-white border-2 border-[#0D9488] rounded-md relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#0D9488] text-white px-4 py-1 rounded text-sm font-medium">Most popular</div>
              <h3 className="text-2xl font-semibold mb-2 text-[#0F1F3D]">Pro</h3>
              <div className="mb-6"><span className="text-4xl font-bold text-[#0F1F3D]">€499</span><span className="text-[#6B7280]">/month</span></div>
              <ul className="space-y-3 mb-8 text-[#6B7280]"><li>5 device profiles</li><li>50 searches/month</li><li>PDF + Excel reports</li><li>Priority support</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 bg-[#0D9488] text-white rounded hover:bg-[#0F766E] transition-colors font-medium">Start free trial</Link>
            </div>
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-md">
              <h3 className="text-2xl font-semibold mb-2 text-[#0F1F3D]">Enterprise</h3>
              <div className="mb-6"><span className="text-4xl font-bold text-[#0F1F3D]">€5,000+</span><span className="text-[#6B7280]">/month</span></div>
              <ul className="space-y-3 mb-8 text-[#6B7280]"><li>Unlimited profiles</li><li>Unlimited searches</li><li>SSO integration</li><li>Dedicated account manager</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 border border-[#E2E8F0] text-[#374151] rounded hover:border-[#0D9488] hover:text-[#0D9488] transition-colors">Contact sales</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-20 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-16 text-slate-900">Frequently Asked Questions</h2>
          <FaqAccordion />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#0F1F3D] text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-8">Stop spending days on PMS searches</h2>
          <Link href="/signup" className="inline-block px-8 py-4 bg-[#0D9488] text-white rounded hover:bg-[#0F766E] transition-colors font-medium">
            Start 14-day free trial
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Product</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-[#0D9488]">Features</a></li>
                <li><a href="#" className="hover:text-[#0D9488]">Pricing</a></li>
                <li><a href="#" className="hover:text-[#0D9488]">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Company</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-[#0D9488]">About</a></li>
                <li><a href="#" className="hover:text-[#0D9488]">Blog</a></li>
                <li><a href="#" className="hover:text-[#0D9488]">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Legal</h4>
              <ul className="space-y-2 text-slate-600">
                <li><Link href="/privacy" className="hover:text-[#0D9488]">Privacy</Link></li>
                <li><Link href="/terms"   className="hover:text-[#0D9488]">Terms</Link></li>
                <li><Link href="/imprint" className="hover:text-[#0D9488]">Imprint</Link></li>
                <li><Link href="/dpa"     className="hover:text-[#0D9488]">DPA</Link></li>
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
            © 2026 Neuridion. Built for PRRCs.
          </div>
        </div>
      </footer>
    </div>
  )
}
