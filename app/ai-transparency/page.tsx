import Link from 'next/link'

export const metadata = {
  title: 'AI Transparency — Neuridion',
  description:
    'How NEURIDION uses artificial intelligence for post-market surveillance, including models, human oversight, and data handling.',
}

export default function AITransparencyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* DRAFT banner */}
        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            DRAFT — Pending legal review. Do not treat as legally binding until reviewed by qualified counsel.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">AI Transparency</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 12 May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          {/* 1. AI System Overview */}
          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. AI System Overview</h2>
            <p>
              NEURIDION uses artificial intelligence to classify Field Safety Notices (FSNs) as part
              of post-market surveillance (PMS) for medical device manufacturers. The AI serves as a
              classification tool that analyses publicly available regulatory notices and determines
              their relevance to your specific device profile.
            </p>
            <p className="mt-3">
              <strong>AI does not</strong> make clinical decisions, diagnose patients, recommend
              treatments, or replace the judgment of a Person Responsible for Regulatory Compliance
              (PRRC). All AI outputs are advisory and require human review before acting on them.
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
                <strong>Pre-filter (Haiku):</strong> Each FSN is evaluated for obvious irrelevance
                to your device profile. Approximately 60&ndash;70% of FSNs are clear exclusions
                (e.g., a dental device FSN when you manufacture cardiac implants) and are handled at
                this stage for speed and efficiency.
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
                PRRC review — they are never silently excluded.
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
                Generated reports include a signature grid for PRRC sign-off, ensuring a qualified
                person reviews and approves the results.
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
              <li>FSN title, manufacturer name, date, and content text</li>
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
              <li>Patient data or protected health information (PHI)</li>
              <li>Health or medical records of any kind</li>
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
                Novel or rare device types may receive less accurate classifications due to limited
                representation in training data.
              </li>
              <li>
                Classification accuracy is highest for English and German language FSNs; other
                languages may yield reduced accuracy.
              </li>
              <li>
                The AI does not have access to proprietary device documentation, IFUs, or internal
                risk assessments — classification is based solely on the FSN text and device profile.
              </li>
              <li>
                All AI-generated outputs must be reviewed and approved by the PRRC before inclusion
                in official PMS documentation.
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
              Under the EU AI Act (Regulation (EU) 2024/1689), NEURIDION&apos;s FSN classification
              system is assessed as <strong>minimal risk</strong>. The system classifies publicly
              available government-published regulatory notices — it does not process biometric data,
              make decisions affecting natural persons&apos; rights, or fall within any Annex III
              high-risk category. A Data Protection Impact Assessment (DPIA) screening has been
              conducted and is available upon request.
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
