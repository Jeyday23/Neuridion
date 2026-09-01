import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Neuridion' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 30 August 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Service description</h2>
            <p>
              Neuridion is an AI-assisted post-market surveillance screening and decision-record
              platform. It retrieves records from supported public regulatory sources, assesses
              potential relevance against a customer-defined device profile, and provides review and
              export functions for medical-device quality and regulatory teams.
            </p>
            <p className="mt-2">
              Neuridion provides screening support, not an autonomous regulatory decision. The
              manufacturer remains responsible for defining its surveillance scope, validating the
              service for its intended use, reviewing source evidence, making final relevance and
              reportability decisions, approving reports, and taking any regulatory action under its
              own procedures.
            </p>
            <p className="mt-2">
              Results are bounded by the selected sources, dates, search configuration, upstream
              availability, device evidence, and released software configuration. AI output may
              contain false positives or false negatives, and confidence values are not calibrated
              probabilities or guarantees of correctness or completeness.
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
              <li>You must not use AI output as an autonomous regulatory conclusion or substitute for required qualified review</li>
              <li>You are responsible for assigning qualified users, maintaining accurate device evidence, and applying your approved QMS and PMS procedures</li>
              <li>You are responsible for preserving required records and testing exports or continuity controls before relying on the service as a system of record</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. Service boundaries</h2>
            <p>
              Supported databases are a bounded subset of potential post-market surveillance
              sources. Neuridion does not replace complaint handling, literature surveillance,
              risk management, CAPA, vigilance, clinical evaluation, or any other source or process
              required by your approved procedures. Source warnings, degraded runs, failed
              assessments, uncertain records, and excluded records selected for control review must
              be handled under your procedure.
            </p>
            <p className="mt-2">
              Any supplier assurance, testing, or validation template we provide is supporting
              evidence only. It is not a certification and does not validate the service within your
              organisation, configuration, intended use, or quality management system.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Payment terms</h2>
            <p>
              Paid plans are billed monthly or annually in advance via Stripe. Prices are listed in
              EUR and exclude VAT where applicable. We reserve the right to change pricing with 30
              days&apos; written notice. Refunds are handled on a case-by-case basis at our discretion.
              Failed payments may result in service suspension. For consumer refund rights, see
              our{' '}
              <Link href="/withdrawal" className="text-[#0D9488] hover:underline">
                Right of Withdrawal
              </Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Intellectual property</h2>
            <p>
              Neuridion and its underlying technology are owned by{' '}
              <strong>Neuridion</strong>. You retain ownership of the device
              profile data and documents you upload. You grant us a limited licence to process that
              data solely for the purpose of providing the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Limitation of liability</h2>
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
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Termination and export</h2>
            <p>
              Either party may terminate at any time. You may delete your account via the settings
              page. We may suspend or terminate accounts that violate these terms. Upon termination,
              your access is revoked immediately; your data is retained per the Privacy Policy
              retention schedule.
            </p>
            <p className="mt-2">
              Before termination, you are responsible for requesting and verifying any export needed
              to meet your record-retention and continuity requirements. Any post-termination access,
              transition assistance, escrow, or additional continuity commitment applies only where
              expressly included in a written agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">8. Governing law &amp; dispute resolution</h2>
            <p>
              These terms are governed by the laws of the Federal Republic of Germany, excluding
              conflict-of-law provisions. The courts of <strong>[TO BE ADDED]</strong>, Germany
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
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">9. Changes to these terms</h2>
            <p>
              We may update these terms. Material changes will be notified by email at least 14 days
              before they take effect. Continued use of the service after that date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">10. Contact</h2>
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
