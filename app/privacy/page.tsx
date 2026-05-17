import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Neuridion' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* DRAFT banner */}
        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ DRAFT — Pending legal review. Do not treat as legally binding until reviewed by qualified counsel.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 12 May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Who we are</h2>
            <p>
              Neuridion (&quot;we&quot;, &quot;us&quot;) is operated by{' '}
              <strong>Neuridion</strong>, registered at{' '}
              <strong>[TO BE ADDED]</strong>, Germany.
              We provide an automated PMS recall search platform for medical device manufacturers
              operating under EU MDR.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. What data we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account data:</strong> email address, full name, company name</li>
              <li><strong>Device profiles:</strong> device names, EMDN codes, intended use descriptions you enter</li>
              <li><strong>Search data:</strong> search queries, date ranges, results, AI filter decisions</li>
              <li><strong>Generated reports:</strong> HTML, PDF and Excel reports stored on our servers</li>
              <li><strong>Usage data:</strong> page views, feature usage, session timestamps (audit log)</li>
              <li><strong>Technical data:</strong> IP address, browser/OS (user-agent), session cookies</li>
              <li><strong>Billing data:</strong> processed by Stripe; we do not store card details</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. Why we process your data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide and operate the Neuridion platform</li>
              <li>To generate, store and deliver FSN search reports</li>
              <li>To manage your account, subscription and billing</li>
              <li>To send transactional notifications (search completion, account security)</li>
              <li>To maintain an audit trail required by EU MDR compliance</li>
              <li>To prevent fraud and abuse (rate limiting, security monitoring)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Legal basis</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Art. 6(1)(b) GDPR — Contract:</strong> processing necessary to deliver the service
                you subscribed to
              </li>
              <li>
                <strong>Art. 6(1)(f) GDPR — Legitimate interest:</strong> security monitoring, fraud
                prevention, improving service reliability
              </li>
              <li>
                <strong>Art. 6(1)(a) GDPR — Consent:</strong> optional analytics cookies (only where
                you have accepted)
              </li>
              <li>
                <strong>Art. 6(1)(c) GDPR — Legal obligation:</strong> audit trail retention for
                regulatory compliance obligations
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Who we share data with</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Supabase (EU region):</strong> database and authentication infrastructure</li>
              <li><strong>Anthropic (US):</strong> AI filtering of FSN content — see Section 8 for international transfers</li>
              <li><strong>PDFShift (FR):</strong> PDF report generation</li>
              <li><strong>Render (US):</strong> application hosting — see Section 8</li>
              <li><strong>Stripe (US):</strong> payment processing — see Section 8</li>
              <li><strong>Resend (US):</strong> transactional email delivery</li>
              <li><strong>Upstash (US):</strong> rate limiting infrastructure — see Section 8</li>
            </ul>
            <p className="mt-2">We do not sell your data to third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Data retention</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Search runs &amp; reports:</strong> retained for the lifetime of your account
                plus 10 years after account closure (EU MDR Art. 83 PMS audit trail requirement)
              </li>
              <li>
                <strong>Account data:</strong> deleted within 30 days of account deletion request,
                subject to the retention period above
              </li>
              <li>
                <strong>Audit logs:</strong> retained for 10 years after creation (EU MDR Art. 10(8))
              </li>
              <li>
                <strong>Marketing communications:</strong> until consent is withdrawn
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Your rights (GDPR)</h2>
            <p>Under GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Access:</strong> request a copy of your personal data</li>
              <li><strong>Rectification:</strong> correct inaccurate data</li>
              <li><strong>Erasure:</strong> request deletion (&quot;right to be forgotten&quot;)</li>
              <li><strong>Portability:</strong> receive your data in machine-readable format</li>
              <li><strong>Objection:</strong> object to processing based on legitimate interest</li>
              <li><strong>Restriction:</strong> request restricted processing in certain circumstances</li>
              <li>
                <strong>Complaint:</strong> lodge a complaint with your supervisory authority —
                in Germany: Bundesbeauftragter für den Datenschutz und die Informationsfreiheit (BfDI)
              </li>
            </ul>
            <p className="mt-2">
              To exercise your rights, use the{' '}
              <Link href="/dashboard/settings" className="text-[#0D9488] hover:underline">
                account settings
              </Link>{' '}
              page or contact us at{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">8. International transfers</h2>
            <p>
              Some of our sub-processors are based outside the EU/EEA. Where personal data is
              transferred to the US (Anthropic, Render, Stripe, Resend, Upstash), we rely on the
              EU Standard Contractual Clauses (SCCs) as the transfer mechanism under Art. 46 GDPR.
              Anthropic processes FSN text content only; no special category data is transmitted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">9. Cookies</h2>
            <p>
              We use essential cookies required to authenticate your session. Optional analytics cookies
              are only set if you consent via the cookie banner. You can withdraw cookie consent at any
              time via the &quot;Manage cookies&quot; link in the footer.
            </p>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 pr-3 font-semibold text-zinc-900">Cookie</th>
                    <th className="text-left py-2 pr-3 font-semibold text-zinc-900">Provider</th>
                    <th className="text-left py-2 pr-3 font-semibold text-zinc-900">Purpose</th>
                    <th className="text-left py-2 pr-3 font-semibold text-zinc-900">Duration</th>
                    <th className="text-left py-2 font-semibold text-zinc-900">Type</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">sb-*-auth-token</td>
                    <td className="py-2 pr-3">Supabase (1st party)</td>
                    <td className="py-2 pr-3">Authentication session JWT</td>
                    <td className="py-2 pr-3">Session</td>
                    <td className="py-2">Essential</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">sb-*-auth-token.0/.1</td>
                    <td className="py-2 pr-3">Supabase (1st party)</td>
                    <td className="py-2 pr-3">Chunked auth token (large JWTs)</td>
                    <td className="py-2 pr-3">Session</td>
                    <td className="py-2">Essential</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">__stripe_mid</td>
                    <td className="py-2 pr-3">Stripe (3rd party)</td>
                    <td className="py-2 pr-3">Fraud prevention identifier</td>
                    <td className="py-2 pr-3">1 year</td>
                    <td className="py-2">Essential</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">__stripe_sid</td>
                    <td className="py-2 pr-3">Stripe (3rd party)</td>
                    <td className="py-2 pr-3">Fraud prevention session</td>
                    <td className="py-2 pr-3">30 minutes</td>
                    <td className="py-2">Essential</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">neuridion_cookie_consent</td>
                    <td className="py-2 pr-3">Neuridion (1st party)</td>
                    <td className="py-2 pr-3">Stores your cookie preference</td>
                    <td className="py-2 pr-3">1 year</td>
                    <td className="py-2">Essential</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm">
              No third-party tracking, marketing, or advertising cookies are used.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">10. Automated decision-making (Art. 22 GDPR)</h2>
            <p>
              Neuridion uses AI to classify Field Safety Notices as &quot;relevant&quot;,
              &quot;uncertain&quot;, or &quot;excluded&quot; relative to your device profile. This constitutes
              automated processing but <strong>does not produce legal or similarly significant effects</strong> on
              individuals — it classifies publicly available regulatory notices, not personal data.
            </p>
            <p className="mt-2">
              All AI classifications are advisory and require human review (PRRC sign-off) before inclusion
              in regulatory documentation. If you wish to disable AI-assisted filtering for your account,
              contact us at{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">info@neuridion.eu</a>.
              For full details on our AI system, see the{' '}
              <Link href="/ai-transparency" className="text-[#0D9488] hover:underline">AI Transparency</Link> page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">11. Data Protection Officer</h2>
            <p>
              Based on our current processing activities and scale, a Data Protection Officer (DPO) has
              not been formally appointed under Art. 37 GDPR. We keep this assessment under review as our
              organisation grows. For all data protection inquiries, please contact us at{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">12. Contact</h2>
            <p>
              Data controller: <strong>Neuridion</strong><br />
              Email:{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>
              <br />
              Address: <strong>[TO BE ADDED]</strong>
            </p>
          </section>

        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 flex gap-4 text-sm">
          <Link href="/"       className="text-[#0D9488] hover:underline">← Home</Link>
          <Link href="/terms"  className="text-[#0D9488] hover:underline">Terms</Link>
          <Link href="/imprint" className="text-[#0D9488] hover:underline">Imprint</Link>
        </div>
      </div>
    </div>
  )
}
