import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Neuridion' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* DRAFT banner */}
        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ DRAFT — Pending legal review. Do not treat as legally binding until reviewed by qualified counsel.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: [DATE — pending review]</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Service description</h2>
            <p>
              Neuridion is an automated PMS (Post-Market Surveillance) recall search platform that
              queries medical device field safety notice databases and filters results using AI. The
              service is intended for use by medical device manufacturers and Persons Responsible for
              Regulatory Compliance (PRRCs) operating under EU MDR and IVDR.
            </p>
            <p className="mt-2">
              Neuridion provides tools to assist with compliance tasks. It does not replace
              professional regulatory judgement, and generated reports should be reviewed by a
              qualified PRRC before inclusion in regulatory documentation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. User obligations</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be at least 18 years old and authorised to enter into contracts on behalf of your organisation</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials</li>
              <li>You may not use the service to violate any applicable laws or regulations</li>
              <li>You may not attempt to reverse engineer, scrape or abuse the service infrastructure</li>
              <li>You must provide accurate information during registration</li>
              <li>You are solely responsible for the regulatory conclusions you draw from search results</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. Payment terms</h2>
            <p>
              Paid plans are billed monthly or annually in advance via Stripe. Prices are listed in
              EUR and exclude VAT where applicable. We reserve the right to change pricing with 30
              days&apos; written notice. Refunds are handled on a case-by-case basis at our discretion.
              Failed payments may result in service suspension.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Intellectual property</h2>
            <p>
              Neuridion and its underlying technology are owned by{' '}
              <strong>[COMPANY LEGAL NAME] — PLACEHOLDER</strong>. You retain ownership of the device
              profile data and documents you upload. You grant us a limited licence to process that
              data solely for the purpose of providing the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Neuridion shall not be liable for
              any indirect, incidental, special, consequential or punitive damages arising from use of
              the service, including but not limited to regulatory penalties resulting from reliance on
              generated reports.
            </p>
            <p className="mt-2">
              Our total aggregate liability to you shall not exceed the greater of (a) the amount you
              paid us in the 12 months preceding the claim or (b) €100.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Termination</h2>
            <p>
              Either party may terminate at any time. You may delete your account via the settings
              page. We may suspend or terminate accounts that violate these terms. Upon termination,
              your access is revoked immediately; your data is retained per the Privacy Policy
              retention schedule.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Governing law &amp; dispute resolution</h2>
            <p>
              These terms are governed by the laws of the Federal Republic of Germany, excluding
              conflict-of-law provisions. The courts of <strong>[CITY — PLACEHOLDER]</strong>, Germany
              have exclusive jurisdiction.
            </p>
            <p className="mt-2">
              EU consumers may also use the EU Online Dispute Resolution platform:{' '}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0D9488] hover:underline"
              >
                ec.europa.eu/consumers/odr
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">8. Changes to these terms</h2>
            <p>
              We may update these terms. Material changes will be notified by email at least 14 days
              before they take effect. Continued use of the service after that date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">9. Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>
            </p>
          </section>

        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 flex gap-4 text-sm">
          <Link href="/"        className="text-[#0D9488] hover:underline">← Home</Link>
          <Link href="/privacy" className="text-[#0D9488] hover:underline">Privacy</Link>
          <Link href="/imprint" className="text-[#0D9488] hover:underline">Imprint</Link>
        </div>
      </div>
    </div>
  )
}
