import Link from 'next/link'

export const metadata = { title: 'Imprint — Neuridion' }

export default function ImprintPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* DRAFT + legal requirement banner */}
        <div className="mb-8 rounded-lg bg-red-50 border border-red-200 px-5 py-4">
          <p className="text-sm font-semibold text-red-800">
            ⚠️ DRAFT — This page must be filled with real company details before public launch.
            Required by §5 TMG (German Telemedia Act) for DACH market operation. Failure to publish
            a legally complete Impressum may result in fines and cease-and-desist actions.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Imprint (Impressum)</h1>
        <p className="text-sm text-zinc-500 mb-10">Required by §5 TMG</p>

        <div className="space-y-8 text-zinc-700">

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-3">Service provider</h2>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 space-y-2 text-sm">
              <div>
                <span className="font-medium text-zinc-500">Company name:</span>{' '}
                <span className="text-red-600 font-medium">[COMPANY LEGAL NAME — REQUIRED]</span>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Legal form:</span>{' '}
                <span className="text-red-600 font-medium">[e.g. GmbH, UG — REQUIRED]</span>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Street address:</span>{' '}
                <span className="text-red-600 font-medium">[STREET + NUMBER — REQUIRED]</span>
              </div>
              <div>
                <span className="font-medium text-zinc-500">City / postcode:</span>{' '}
                <span className="text-red-600 font-medium">[POSTCODE CITY — REQUIRED]</span>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Country:</span>{' '}
                Germany
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-3">Contact</h2>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 space-y-2 text-sm">
              <div>
                <span className="font-medium text-zinc-500">Email:</span>{' '}
                <span className="text-red-600 font-medium">[EMAIL — REQUIRED]</span>
              </div>
              <div>
                <span className="font-medium text-zinc-500">Phone:</span>{' '}
                <span className="text-red-600 font-medium">[PHONE — REQUIRED (§5 TMG)]</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-3">Represented by</h2>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 space-y-2 text-sm">
              <div>
                <span className="font-medium text-zinc-500">Managing director (Geschäftsführer):</span>{' '}
                <span className="text-red-600 font-medium">[FULL NAME — REQUIRED]</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-3">Register &amp; VAT</h2>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 space-y-2 text-sm">
              <div>
                <span className="font-medium text-zinc-500">Commercial register (Handelsregister):</span>{' '}
                <span className="text-red-600 font-medium">[REGISTER COURT + NUMBER — REQUIRED]</span>
              </div>
              <div>
                <span className="font-medium text-zinc-500">VAT ID (Umsatzsteuer-ID §27a UStG):</span>{' '}
                <span className="text-red-600 font-medium">[DE + 9 DIGITS — REQUIRED]</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-3">Responsible for content (§55 Abs. 2 RStV)</h2>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 text-sm">
              <span className="text-red-600 font-medium">[FULL NAME + ADDRESS — REQUIRED]</span>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-3">Dispute resolution</h2>
            <p className="text-sm">
              The European Commission provides an online dispute resolution platform:{' '}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                ec.europa.eu/consumers/odr
              </a>
              . We are not obligated nor willing to participate in dispute resolution proceedings
              before a consumer arbitration board.
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
