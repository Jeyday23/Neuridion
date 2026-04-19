import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, FileText, Download, Shield, CheckCircle, Lock, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FaqAccordion } from './components/FaqAccordion'

export const metadata = {
  title: 'Kodex Medical — Automated PMS Recall Search for EU MDR',
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/search')

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-white text-2xl font-bold">Kodex Medical</div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-white hover:text-blue-200 transition-colors">
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <h1 className="text-6xl font-bold mb-6 leading-tight">
            PMS search in 6 minutes,<br />not 6 hours
          </h1>
          <p className="text-xl text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            Kodex Medical automatically searches BfArM, FDA MAUDE and 18 other global recall
            databases — then filters results for your specific device using AI. EU MDR Article 83 compliant.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Start free trial
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 border-2 border-white text-white rounded-lg hover:bg-white hover:text-slate-900 transition-colors font-semibold"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-white py-16 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-slate-500 mb-8">Trusted by PRRCs at medical device companies across Europe</p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-blue-600" />
              </div>
              <div className="font-bold text-slate-900 text-lg">CE</div>
              <div className="text-xs text-slate-500">Mark</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Award className="w-8 h-8 text-green-600" />
              </div>
              <div className="font-bold text-slate-900 text-lg">ISO 13485</div>
              <div className="text-xs text-slate-500">Certified</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
                <Lock className="w-8 h-8 text-purple-600" />
              </div>
              <div className="font-bold text-slate-900 text-lg">GDPR</div>
              <div className="text-xs text-slate-500">Compliant</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <div className="font-bold text-slate-900 text-lg">EU MDR</div>
              <div className="text-xs text-slate-500">Compliant</div>
            </div>
            <div className="flex flex-col items-center gap-2 px-6 py-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-indigo-600" />
              </div>
              <div className="font-bold text-slate-900 text-lg">ISO 27001</div>
              <div className="text-xs text-slate-500">Certified</div>
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
            <div className="p-8 bg-white border border-slate-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <Search className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-slate-900">20+ databases</h3>
              <p className="text-slate-600">BfArM, FDA MAUDE, MHRA and 18 others searched automatically</p>
            </div>
            <div className="p-8 bg-white border border-slate-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-slate-900">AI-powered filtering</h3>
              <p className="text-slate-600">Claude filters FSNs relevant to your specific device profile</p>
            </div>
            <div className="p-8 bg-white border border-slate-200 rounded-xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-slate-900">Audit-ready reports</h3>
              <p className="text-slate-600">Export PDF reports formatted for MDR compliance documentation</p>
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
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">1</div>
              <FileText className="w-8 h-8 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-3 text-slate-900">Create a device profile</h3>
              <p className="text-slate-600">Define your device characteristics and search terms</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">2</div>
              <Search className="w-8 h-8 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-3 text-slate-900">Run automated search</h3>
              <p className="text-slate-600">Search across databases automatically with AI filtering</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">3</div>
              <Download className="w-8 h-8 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-3 text-slate-900">Download audit-ready report</h3>
              <p className="text-slate-600">Get MDR-compliant documentation ready for audits</p>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="bg-slate-900 text-white py-20">
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
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mt-1 flex-shrink-0">
                      <span className="text-white text-sm">✓</span>
                    </div>
                    <span className="text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-800 rounded-xl h-80 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <Shield className="w-24 h-24 mx-auto mb-4 text-blue-400" />
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
          <div className="grid md:grid-cols-4 gap-6">
            <div className="p-8 bg-white border border-slate-200 rounded-xl">
              <h3 className="text-2xl font-bold mb-2 text-slate-900">Free</h3>
              <div className="mb-6"><span className="text-4xl font-bold text-slate-900">€0</span><span className="text-slate-500">/month</span></div>
              <ul className="space-y-3 mb-8 text-slate-600"><li>1 profile</li><li>5 searches/month</li><li>Basic reports</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Get started</Link>
            </div>
            <div className="p-8 bg-white border border-slate-200 rounded-xl">
              <h3 className="text-2xl font-bold mb-2 text-slate-900">Starter</h3>
              <div className="mb-6"><span className="text-4xl font-bold text-slate-900">€149</span><span className="text-slate-500">/month</span></div>
              <ul className="space-y-3 mb-8 text-slate-600"><li>5 profiles</li><li>Unlimited searches</li><li>Basic reports</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Start trial</Link>
            </div>
            <div className="p-8 bg-white border-2 border-blue-600 rounded-xl relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">Most popular</div>
              <h3 className="text-2xl font-bold mb-2 text-slate-900">Pro</h3>
              <div className="mb-6"><span className="text-4xl font-bold text-slate-900">€499</span><span className="text-slate-500">/month</span></div>
              <ul className="space-y-3 mb-8 text-slate-600"><li>Unlimited profiles</li><li>API access</li><li>Priority support</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Start trial</Link>
            </div>
            <div className="p-8 bg-white border border-slate-200 rounded-xl">
              <h3 className="text-2xl font-bold mb-2 text-slate-900">Enterprise</h3>
              <div className="mb-6"><span className="text-2xl font-bold text-slate-900">Custom</span></div>
              <ul className="space-y-3 mb-8 text-slate-600"><li>Unlimited everything</li><li>SSO integration</li><li>Dedicated support</li></ul>
              <Link href="/signup" className="block w-full text-center px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Contact sales</Link>
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
      <section className="bg-slate-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-8">Ready to reclaim 5 hours per week?</h2>
          <Link href="/signup" className="inline-block px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold">
            Start free trial
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
                <li><a href="#" className="hover:text-blue-600">Features</a></li>
                <li><a href="#" className="hover:text-blue-600">Pricing</a></li>
                <li><a href="#" className="hover:text-blue-600">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Company</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-blue-600">About</a></li>
                <li><a href="#" className="hover:text-blue-600">Blog</a></li>
                <li><a href="#" className="hover:text-blue-600">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Legal</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-blue-600">Privacy</a></li>
                <li><a href="#" className="hover:text-blue-600">Terms</a></li>
                <li><a href="#" className="hover:text-blue-600">DPA</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-slate-900">Social</h4>
              <ul className="space-y-2 text-slate-600">
                <li><a href="#" className="hover:text-blue-600">LinkedIn</a></li>
                <li><a href="#" className="hover:text-blue-600">Twitter</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-200 text-center text-slate-500">
            © 2026 Kodex Medical. Built for PRRCs.
          </div>
        </div>
      </footer>
    </div>
  )
}
