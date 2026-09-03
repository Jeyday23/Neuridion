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
        <p className="text-sm text-zinc-500 mb-10">Last updated: 3 September 2026</p>

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
                    <td className="py-2 pr-4">Claude Sonnet 4.6</td>
                    <td className="py-2 pr-4">
                      Advisory relevance ranking and rationale; it has no authority to exclude records
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
            <p className="mt-3 text-sm">
              Alternative model providers may be evaluated in shadow benchmarks. Their output is
              not used as the production regulatory disposition unless it passes the controlled
              release process for the stated dataset and configuration.
            </p>
          </section>

          {/* 3. How AI Classification Works */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">
              3. How AI Classification Works
            </h2>
            <p>NEURIDION separates auditable safety rules from advisory AI ranking:</p>
            <ol className="list-decimal pl-5 space-y-3 mt-3">
              <li>
                <strong>Deterministic scope and vigilance rules:</strong> Structured, checkable
                grounds may mark a record outside scope without deleting it. Death, serious
                deterioration, serious-incident, FSCA, recall, and field-safety-action signals bypass
                model ranking and are routed to human review.
              </li>
              <li>
                <strong>AI ranking:</strong> Residual records receive a high, medium, or low
                presentation rank with a written rationale. AI output may prioritize the review
                queue, but it never deletes a record or creates a regulatory exclusion.
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
                Every source record remains in the evidence record. Low-ranked records are a
                presentation category, not silently discarded evidence.
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
              <li>
                Each AI decision records the exact provider and model identifier, prompt and ruleset
                versions, input snapshot hash, output hash, decision time, and whether a compatible
                cached decision was reused. Re-runs can reveal drift; identical output is not promised.
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
              <li>
                Version-controlled passages from customer-supplied controlled evidence, such as an
                IFU, only when that evidence is enabled for the assessment
              </li>
            </ul>
            <p className="mt-2 text-sm">
              Public regulatory evidence is separated from customer-supplied controlled evidence.
              When controlled evidence is enabled, the assessment records the document version and
              authorized passage references used. Customers must confirm that their provider terms,
              confidentiality requirements, and approved procedure permit this processing.
            </p>

            <h3 className="text-lg font-medium text-zinc-900 mt-6 mb-2">What is NOT sent to AI</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your email address, password, or authentication credentials</li>
              <li>Customer patient records or clinical records intentionally uploaded for screening</li>
              <li>Payment information or billing details</li>
              <li>Controlled documents that have not been explicitly enabled for the assessment</li>
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
                Model APIs may return different wording or rankings on a later re-run even with the
                same temperature setting. Neuridion records inputs, configuration, and outputs to
                detect and investigate that drift rather than claiming bit-level determinism.
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
