import Link from 'next/link'

export const metadata = { title: 'Data Processing Agreement — Kodex Medical' }

export default function DpaPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* DRAFT banner */}
        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ DRAFT — Pending legal review. DPA template not yet finalised.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Data Processing Agreement (DPA)</h1>
        <p className="text-sm text-zinc-500 mb-10">Art. 28 GDPR — For B2B customers</p>

        <div className="space-y-8 text-zinc-700 text-sm leading-relaxed">

          <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-base font-semibold text-blue-900 mb-2">Do you need a DPA?</h2>
            <p className="text-blue-800">
              If your organisation processes personal data using Kodex Medical and is itself a data
              controller (e.g. a medical device manufacturer processing patient-related search terms),
              a Data Processing Agreement is required under Art. 28 GDPR.
            </p>
            <p className="mt-2 text-blue-800">
              Contact us to sign a DPA:{' '}
              <a href="mailto:legal@kodex-medical.com" className="underline">
                legal@kodex-medical.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">What a Kodex DPA covers</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Subject matter, duration, nature and purpose of processing</li>
              <li>Categories of personal data processed (names, emails, device search terms)</li>
              <li>Your rights as data controller and our obligations as data processor</li>
              <li>Sub-processor list and change notification process</li>
              <li>Technical and organisational measures (TOMs)</li>
              <li>Procedures for data subject rights requests</li>
              <li>Breach notification timelines (72-hour rule)</li>
              <li>Return or deletion of data on termination</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">Our sub-processors</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-zinc-200 rounded-lg text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-zinc-700">Sub-processor</th>
                    <th className="text-left px-4 py-2 font-medium text-zinc-700">Location</th>
                    <th className="text-left px-4 py-2 font-medium text-zinc-700">Purpose</th>
                    <th className="text-left px-4 py-2 font-medium text-zinc-700">Transfer basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ['Supabase',   'EU',    'Database & auth',        'Same region'],
                    ['Anthropic',  'US',    'AI FSN filtering',       'SCCs'],
                    ['PDFShift',   'FR',    'PDF generation',         'Same region'],
                    ['Render',     'US',    'Application hosting',    'SCCs'],
                    ['Stripe',     'US',    'Payment processing',     'SCCs'],
                    ['Resend',     'US',    'Transactional email',    'SCCs'],
                  ].map(([name, loc, purpose, basis]) => (
                    <tr key={name} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium">{name}</td>
                      <td className="px-4 py-2">{loc}</td>
                      <td className="px-4 py-2">{purpose}</td>
                      <td className="px-4 py-2">{basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">Request a DPA</h2>
            <p>
              To receive a draft DPA for countersignature, email{' '}
              <a href="mailto:legal@kodex-medical.com" className="text-blue-600 hover:underline">
                legal@kodex-medical.com
              </a>{' '}
              with the subject line &quot;DPA Request&quot; and your company details. We aim to respond
              within 5 business days.
            </p>
          </section>

        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 flex gap-4 text-sm">
          <Link href="/"        className="text-blue-600 hover:underline">← Home</Link>
          <Link href="/privacy" className="text-blue-600 hover:underline">Privacy</Link>
          <Link href="/terms"   className="text-blue-600 hover:underline">Terms</Link>
        </div>
      </div>
    </div>
  )
}
