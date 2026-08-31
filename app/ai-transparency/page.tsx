import Link from 'next/link'

export const metadata = {
  title: 'AI Transparency — Neuridion',
  description:
    'How Neuridion uses AI-assisted screening for post-market surveillance, including human oversight, limitations, and data handling.',
}

export default function AITransparencyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">AI Transparency</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 12 May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          {/* 1. AI System Overview */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. AI System Overview</h2>
            <p>
              Neuridion uses artificial intelligence to assist with screening Field Safety Notices
              (FSNs) and other supported public safety records as part of a manufacturer&apos;s
              post-market surveillance (PMS) process. The system assesses potential relevance to a
              customer-defined device profile and presents its output for human review.
            </p>
            <p className="mt-3">
              <strong>AI does not</strong> make clinical decisions, diagnose patients, recommend
              treatments, or replace the judgment of a Person Responsible for Regulatory Compliance
              (PRRC). It does not determine reportability or regulatory action. The manufacturer
              remains responsible for the final disposition and any downstream action.
            </p>
          </section>

          {/* 2. Models Used */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. Models Used</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 pr-4 font-semibold text-zinc-900">Model</th>
                    <th className="text-left py-2 pr-4 font-semibold text-zinc-900">Role</th>
                    <th className="text-left py-2 font-semibold text-zinc-900">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-4">Claude Haiku 4.5</td>
                    <td className="py-2 pr-4">
                      Pre-filter triage — fast exclusion of clearly unrelated FSNs
                    </td>
                    <td className="py-2">Anthropic</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-4">Claude Sonnet 4.6</td>
                    <td className="py-2 pr-4">
                      Full classification — detailed relevance analysis with rationale
                    </td>
                    <td className="py-2">Anthropic</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm">
              Anthropic&apos;s API usage policy states that inputs sent via the API are not used to
              train their models.
            </p>
          </section>

          {/* 3. How AI Classification Works */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">
              3. How AI Classification Works
            </h2>
            <p>NEURIDION uses a two-stage classification pipeline:</p>
            <ol className="list-decimal pl-5 space-y-3 mt-3">
              <li>
                <strong>Pre-filter (Haiku):</strong> Records may be assessed for obvious
                irrelevance to the configured device profile so that human attention can be focused
                on the most plausible matches. The proportion handled at this stage varies by
                profile, source, and monitoring period.
              </li>
              <li>
                <strong>Full classification (Sonnet):</strong> Remaining FSNs receive a detailed
                analysis. Each is classified as <strong>relevant</strong>,{' '}
                <strong>uncertain</strong>, or <strong>excluded</strong>, accompanied by a
                written rationale and a confidence score between 0.0 and 1.0.
              </li>
            </ol>
          </section>

          {/* 4. Human Oversight Measures */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">
              4. Human Oversight Measures
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Items classified as <strong>&quot;uncertain&quot;</strong> are explicitly flagged for
                human attention rather than being treated as a final regulatory conclusion.
              </li>
              <li>
                If the AI filter fails for a specific FSN, that item is marked as{' '}
                <strong>&quot;requires manual review&quot;</strong> rather than being silently
                dropped.
              </li>
              <li>
                Users can cancel any running search at any time.
              </li>
              <li>
                Report release is subject to the configured human-review gate. The customer is
                responsible for assigning qualified reviewers and defining the meaning of approval
                within its own procedure.
              </li>
              <li>
                All filter decisions are stored in an immutable, append-only audit trail — decisions
                cannot be edited or deleted after the fact.
              </li>
            </ul>
          </section>

          {/* 5. Data Handling */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Data Handling</h2>

            <h3 className="text-lg font-medium text-zinc-900 mt-4 mb-2">What is sent to AI</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>FSN or source-record title, manufacturer name, date, and content text</li>
              <li>
                Device profile context (device name, manufacturer, intended use, device class)
              </li>
            </ul>
            <p className="mt-2 text-sm">
              All data sent to the AI consists of publicly available regulatory notices published by
              government agencies (BfArM, FDA, MHRA, Swissmedic) and device profile information you
              have entered.
            </p>

            <h3 className="text-lg font-medium text-zinc-900 mt-6 mb-2">What is NOT sent to AI</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your email address, password, or authentication credentials</li>
              <li>Customer patient records or clinical records intentionally uploaded for screening</li>
              <li>Payment information or billing details</li>
              <li>Internal company documents or proprietary files</li>
            </ul>
          </section>

          {/* 6. Known Limitations */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Known Limitations</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                All AI classifications are <strong>advisory only</strong> and must be reviewed by a
                qualified person before being relied upon for regulatory decisions.
              </li>
              <li>
                Confidence scores are model estimates, not calibrated statistical probabilities.
              </li>
              <li>
                Novel, rare, multilingual, or ambiguously described device records may be harder to
                assess reliably.
              </li>
              <li>
                No universal sensitivity, specificity, or accuracy claim is made. Verification
                evidence is bounded to the stated dataset, sources, release, and configuration.
              </li>
              <li>
                Controlled documents affect an assessment only where the active release explicitly
                extracts, versions, and supplies that evidence to the screening pipeline. A stored or
                uploaded path alone does not establish that its contents were used.
              </li>
              <li>
                AI-generated output must be reviewed under the manufacturer&apos;s approved procedure
                before it is relied upon in official PMS documentation.
              </li>
            </ul>
          </section>

          {/* 7. Prohibited Practices Statement */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">
              7. Prohibited Practices Statement (EU AI Act Art. 5)
            </h2>
            <p>
              NEURIDION does not engage in any practices prohibited under Article 5 of the EU AI
              Act. Specifically, the system does not:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>Deploy subliminal, manipulative, or deceptive techniques</li>
              <li>Exploit vulnerabilities related to age, disability, or social/economic situation</li>
              <li>Evaluate or classify individuals based on social behaviour (social scoring)</li>
              <li>Perform real-time remote biometric identification</li>
            </ul>
            <p className="mt-3">
              The system&apos;s sole function is classifying publicly available government-published
              Field Safety Notices against user-defined device profiles.
            </p>
          </section>

          {/* 8. EU AI Act Risk Classification */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">
              8. EU AI Act Risk Classification
            </h2>
            <p>
              Neuridion&apos;s current working position is that the bounded screening function is not a
              high-risk AI system under Article 6: it is not intended as a medical device or a
              safety component and does not match an Annex III use case. This is a draft position,
              not a certification or legal opinion, and it must be reassessed if the intended use,
              decision authority, integrations, models, data, or applicable law changes. Neuridion
              labels AI-assisted output and documents limitations as governance controls. The exact
              Article 50 duties for a released configuration require confirmation by qualified
              counsel and quality/regulatory review.
            </p>
          </section>

          {/* 9. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">9. Contact</h2>
            <p>
              For questions about our use of AI, data handling, or this transparency disclosure,
              contact us at{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>.
            </p>
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
