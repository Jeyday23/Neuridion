import Link from 'next/link'

export const metadata = { title: 'Accessibility — Neuridion' }

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            DRAFT — Pending legal review. Effective from 28 June 2025 under the Barrierefreiheitsst&auml;rkungsgesetz (BFSG).
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Accessibility Statement</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 12 May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Commitment to accessibility</h2>
            <p>
              Neuridion is committed to ensuring digital accessibility for people with disabilities. We are
              continually improving the user experience for everyone and applying the relevant accessibility
              standards.
            </p>
            <p className="mt-2">
              This statement applies to the web application at{' '}
              <strong>https://neuridion.eu</strong> and all pages served under that domain.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. Conformance status</h2>
            <p>
              We target conformance with the{' '}
              <strong>Web Content Accessibility Guidelines (WCAG) 2.1, Level AA</strong>. WCAG 2.1
              Level AA is the standard referenced by EN 301 549, the harmonised European standard
              implementing the European Accessibility Act (Directive (EU) 2019/882), transposed into
              German law by the Barrierefreiheitsst&auml;rkungsgesetz (BFSG).
            </p>
            <p className="mt-2">
              <strong>Current status: Partially conformant.</strong> Some parts of the content do not
              yet fully conform to the accessibility standard. A comprehensive third-party accessibility
              audit has not yet been completed. The known limitations listed below are based on internal
              review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. Known limitations</h2>
            <p>Despite our best efforts, some content may not yet be fully accessible:</p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                <strong>Data tables:</strong> Search results and archive tables use dynamic sorting and
                pagination that may not announce state changes to assistive technology.
              </li>
              <li>
                <strong>PDF reports:</strong> Generated PDF reports may not be fully tagged or structured
                for screen reader compatibility. Contact us to request an alternative format.
              </li>
              <li>
                <strong>Excel reports:</strong> Exported Excel files may lack semantic structure required
                for full screen reader navigation.
              </li>
              <li>
                <strong>Interactive components:</strong> Some dropdown menus, modal dialogs, and date range
                pickers may not have complete keyboard navigation or ARIA labelling.
              </li>
              <li>
                <strong>Colour-coded indicators:</strong> Status badges (relevant, uncertain, excluded) rely
                partly on colour. We are working to add text labels to all such indicators.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Technologies</h2>
            <p>Neuridion relies on the following technologies:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>HTML5, CSS (Tailwind CSS)</li>
              <li>JavaScript / TypeScript (React 19, Next.js)</li>
              <li>WAI-ARIA (where implemented)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Supported browsers and assistive technology</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Browsers:</strong> Current versions of Chrome, Firefox, Safari, and Edge</li>
              <li><strong>Screen readers:</strong> VoiceOver (macOS/iOS), NVDA (Windows), JAWS (Windows)</li>
              <li><strong>Input methods:</strong> Keyboard navigation, touch input, pointer/mouse input</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Feedback and contact</h2>
            <p>
              We welcome your feedback on the accessibility of Neuridion. If you encounter accessibility
              barriers or need content in an alternative format, please contact us:
            </p>
            <p className="mt-2">
              Email:{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>{' '}
              (subject line: &quot;Accessibility Feedback&quot;)
            </p>
            <p className="mt-1 text-sm">
              We aim to respond to accessibility feedback within 10 business days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Enforcement procedure</h2>
            <p>
              If you are not satisfied with our response to your accessibility feedback, you may contact
              the relevant enforcement body in Germany:
            </p>
            <div className="mt-3 rounded border border-zinc-200 px-4 py-3 text-sm">
              <p className="font-semibold text-zinc-900">Schlichtungsstelle nach &sect; 16 BGG</p>
              <p>Bundesministerium f&uuml;r Arbeit und Soziales</p>
              <p>Mauerstra&szlig;e 53, 10117 Berlin, Germany</p>
              <p className="mt-1">
                Website:{' '}
                <a
                  href="https://www.schlichtungsstelle-bgg.de"
                  className="text-[#0D9488] hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  schlichtungsstelle-bgg.de
                </a>
              </p>
              <p>
                Email:{' '}
                <a href="mailto:info@schlichtungsstelle-bgg.de" className="text-[#0D9488] hover:underline">
                  info@schlichtungsstelle-bgg.de
                </a>
              </p>
              <p className="mt-1 text-zinc-500">The arbitration process is free of charge.</p>
            </div>
          </section>

        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 flex gap-4 text-sm">
          <Link href="/" className="text-[#0D9488] hover:underline">&larr; Home</Link>
          <Link href="/privacy" className="text-[#0D9488] hover:underline">Privacy</Link>
          <Link href="/terms" className="text-[#0D9488] hover:underline">Terms</Link>
        </div>
      </div>
    </div>
  )
}
