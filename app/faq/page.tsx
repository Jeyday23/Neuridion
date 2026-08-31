import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'

export const metadata: Metadata = {
  title: 'FAQ — Neuridion',
  description: 'Frequently asked questions about Neuridion AI-assisted PMS screening for medical device manufacturers.',
}

const FAQ_SECTIONS = [
  {
    title: 'Product',
    items: [
      {
        q: 'What does Neuridion do?',
        a: 'Neuridion supports Field Safety Notice (FSN) and safety-record screening within a medical device manufacturer\'s post-market surveillance process. It searches the selected BfArM, FDA MAUDE, MHRA, and Swissmedic sources, then uses device-profile matching and AI-assisted assessment to help reviewers triage records. The manufacturer retains the final disposition and regulatory decision.',
      },
      {
        q: 'Which regulatory databases are covered?',
        a: 'BfArM (Germany), FDA MAUDE (USA), MHRA (UK), and Swissmedic (Switzerland). Additional sources including ANSM and EUDAMED are on the roadmap.',
      },
      {
        q: 'What counts as one search?',
        a: 'One search = one click of "Run Search." This searches all selected databases in parallel for the specified date range and device profile. Selecting 4 databases still counts as 1 search.',
      },
      {
        q: 'What report formats are available?',
        a: 'PDF, Word (.docx), and Excel. Available content varies by format and release. Treat exported reports as controlled drafts until the customer\'s authorized review and approval procedure is complete.',
      },
      {
        q: 'Can I see a sample report before signing up?',
        a: 'Yes. Visit the <a href="/sample-report" class="text-[#0D9488] hover:underline">sample report page</a> to see the full structure of a Neuridion PMS report.',
      },
    ],
  },
  {
    title: 'AI & Classification',
    items: [
      {
        q: 'How does the AI classification work?',
        a: 'Each FSN is assessed by Anthropic Claude against your device profile (device name, manufacturer, EMDN code, device class, intended use). The AI produces a decision (relevant, uncertain, or excluded), a written rationale, and a confidence score. For full details, see the <a href="/ai-transparency" class="text-[#0D9488] hover:underline">AI Transparency</a> page.',
      },
      {
        q: 'Is the AI making the final decision?',
        a: 'No. AI classifications are screening aids. The manufacturer defines who is qualified and authorized to review records, decide relevance and reportability, approve the final disposition, and initiate regulatory action. Neuridion does not perform those decisions autonomously.',
      },
      {
        q: 'What does the confidence score mean?',
        a: 'The confidence score is a model-generated indicator associated with the assessment. It is not a calibrated probability, an accuracy percentage, or evidence that a record can be skipped. Review the source evidence and rationale under your approved procedure.',
      },
      {
        q: 'What happens if I add an EMDN code to my profile?',
        a: 'An EMDN (European Medical Device Nomenclature) code supplies additional device-category context. It may improve matching for some records, but it does not guarantee completeness or classification accuracy and does not replace model, variant, intended-purpose, and manufacturer evidence.',
      },
    ],
  },
  {
    title: 'Data & Privacy',
    items: [
      {
        q: 'Where is my data stored?',
        a: 'All data is stored in Supabase (EU region). The database is encrypted at rest and in transit. See our <a href="/privacy" class="text-[#0D9488] hover:underline">Privacy Policy</a> for full details.',
      },
      {
        q: 'What data is sent to the AI?',
        a: 'The screening request may include device-profile fields and relevant text from the public source record. Source-specific preprocessing and minimization controls apply. Do not upload customer patient or clinical records for this workflow. Public adverse-event or safety records may still contain incidental personal information; consult the current DPA and AI Transparency page for the released data flow.',
      },
      {
        q: 'Is there a Data Processing Agreement (DPA)?',
        a: 'Yes. Our DPA is available at <a href="/dpa" class="text-[#0D9488] hover:underline">our DPA page</a>. It covers Neuridion as a processor and lists all sub-processors (Supabase, Anthropic, Stripe, Resend).',
      },
      {
        q: 'How long is data retained?',
        a: 'The current platform retention policy and technical controls are described in the Privacy Policy and your service agreement. The manufacturer must define and approve the retention period and legal basis for its own records. Some traceability records may be retained or anonymized rather than erased; request an export and confirm the applicable schedule before relying on Neuridion as a record system.',
      },
    ],
  },
  {
    title: 'Regulatory Fit',
    items: [
      {
        q: 'How does Neuridion fit into my PMS plan?',
        a: 'Neuridion can support public-source monitoring and initial screening within a customer-defined PMS process. It is not a complete PMS system. The manufacturer must determine the required sources, frequency, device scope, roles, escalation criteria, and downstream actions in its approved PMS plan and procedures.',
      },
      {
        q: 'Is Neuridion validated for use in a QMS?',
        a: 'Neuridion is not pre-validated for every customer use. For software used in its QMS, the manufacturer remains responsible for defining intended use and completing validation proportionate to risk under its own ISO 13485 clause 4.1.6 procedure. Neuridion can provide a supplier assurance pack and acceptance-test template as supporting evidence; those materials do not replace customer validation.',
      },
      {
        q: 'Does using Neuridion satisfy my PMS obligations?',
        a: 'Neuridion supports but does not replace your PMS obligations. It covers FSN monitoring across four databases. Your PMS plan may also require monitoring of scientific literature, customer complaints, registry data, and other sources not covered by Neuridion.',
      },
    ],
  },
  {
    title: 'Plans & Billing',
    items: [
      {
        q: 'Is there a free trial?',
        a: 'Yes. All paid plans include a 14-day free trial. No credit card is required to start. The free tier also gives you 1 search run to try the platform.',
      },
      {
        q: 'Can I switch plans?',
        a: 'Yes. You can upgrade or downgrade at any time from Settings > Billing. Changes take effect immediately, with prorated charges.',
      },
      {
        q: 'Do you offer annual pricing?',
        a: 'Annual pricing is available on request. Contact us at <a href="mailto:info@neuridion.eu" class="text-[#0D9488] hover:underline">info@neuridion.eu</a> for details.',
      },
    ],
  },
]

function renderFaqAnswer(text: string): ReactNode {
  // Split on <a href="...">...</a> patterns and convert to React elements
  const parts = text.split(/(<a\s+href="[^"]*"[^>]*>[^<]*<\/a>)/g)
  if (parts.length === 1) return text

  return parts.map((part, i) => {
    const match = part.match(/<a\s+href="([^"]*)"[^>]*>([^<]*)<\/a>/)
    if (match) {
      const [, href, label] = match
      return (
        <a key={i} href={href} className="text-[#0D9488] hover:underline">
          {label}
        </a>
      )
    }
    return part
  })
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-white text-[#1E293B]">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <NeuridionWordmark markSize={36} />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-[#0F766E] hover:text-[#0F1F3D] transition-colors">Log in</Link>
            <Link href="/signup" className="text-sm px-4 py-2 bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#1a2d52] transition-colors">Start free trial</Link>
          </div>
        </div>
      </nav>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-2xl font-bold text-[#0F1F3D] mb-2">Frequently Asked Questions</h1>
          <p className="text-sm text-[#0F766E] mb-10">
            Can&apos;t find what you&apos;re looking for? Contact us at{' '}
            <a href="mailto:info@neuridion.eu" className="underline hover:text-[#0F1F3D]">info@neuridion.eu</a>.
          </p>

          <div className="space-y-10">
            {FAQ_SECTIONS.map((section) => (
              <div key={section.title}>
                <h2 className="text-sm font-semibold text-[#0F1F3D] uppercase tracking-wider mb-4 border-b border-[#E2E8F0] pb-2">
                  {section.title}
                </h2>
                <dl className="space-y-5">
                  {section.items.map((item) => (
                    <div key={item.q}>
                      <dt className="text-sm font-medium text-[#0F1F3D] mb-1">{item.q}</dt>
                      <dd className="text-sm text-[#475569] leading-relaxed">
                        {renderFaqAnswer(item.a)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-white border-t border-[#E2E8F0] py-12">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#0D9488]">
            <span>&copy; 2026 Neuridion. All rights reserved.</span>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-[#0F1F3D]">Privacy</Link>
              <Link href="/terms" className="hover:text-[#0F1F3D]">Terms</Link>
              <Link href="/imprint" className="hover:text-[#0F1F3D]">Imprint</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
