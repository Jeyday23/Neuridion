import type { Metadata } from 'next'
import Link from 'next/link'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'

export const metadata: Metadata = {
  title: 'FAQ — Neuridion',
  description: 'Frequently asked questions about Neuridion PMS automation for medical device manufacturers.',
}

const FAQ_SECTIONS = [
  {
    title: 'Product',
    items: [
      {
        q: 'What does Neuridion do?',
        a: 'Neuridion automates the Field Safety Notice (FSN) monitoring step of post-market surveillance for medical device manufacturers. It searches BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel, then uses AI to assess each notice against your device profile as relevant, uncertain, or excluded — with a written rationale for every decision.',
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
        a: 'PDF, Word (.docx), and Excel. Word is the recommended format for PRRCs who need to annotate, edit, or integrate the report into their Technical File. All formats include the methodology section, classification rationale, and signature blocks.',
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
        a: 'No. All AI classifications are advisory. Your PRRC must review every decision and mark the review as complete before a report can be generated. The AI helps you triage hundreds of notices quickly — the human makes the final call.',
      },
      {
        q: 'What does the confidence score mean?',
        a: 'The confidence score (0-100%) indicates how certain the AI is that its classification is correct. A 94% on "Relevant" means the AI is very confident this notice is relevant to your device. A 52% on "Uncertain" means the AI cannot make a clear determination — human review is especially important for these items.',
      },
      {
        q: 'What happens if I add an EMDN code to my profile?',
        a: 'Adding your EMDN (European Medical Device Nomenclature) code gives the AI stronger signal for classification. Devices with EMDN codes receive more precise assessments because the AI can match at the device category level, not just by keywords.',
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
        a: 'Your device profile (name, manufacturer, EMDN code, device class, intended use) and the public FSN text are sent to Anthropic Claude via their API. Per Anthropic\'s API terms, this data is not used to train their models. No patient data or personal data is ever sent.',
      },
      {
        q: 'Is there a Data Processing Agreement (DPA)?',
        a: 'Yes. Our DPA is available at <a href="/dpa" class="text-[#0D9488] hover:underline">neuridion.eu/dpa</a>. It covers Neuridion as a processor and lists all sub-processors (Supabase, Anthropic, Stripe, Resend).',
      },
      {
        q: 'How long is data retained?',
        a: 'Search runs and reports are retained for the lifetime of your account plus 10 years, in accordance with EU MDR Art. 10(8) requirements for Technical Documentation. Audit logs follow the same 10-year retention. You can request full data export or deletion at any time under GDPR Art. 15-20.',
      },
    ],
  },
  {
    title: 'Regulatory Fit',
    items: [
      {
        q: 'How does Neuridion fit into my PMS plan?',
        a: 'Neuridion handles the FSN database monitoring and initial assessment step of your PMS plan (EU MDR Art. 84). It does not replace your complete PMS system — it automates the most time-consuming part. Your PMS plan should document Neuridion as a tool used for systematic FSN screening, with PRRC review as the human oversight step.',
      },
      {
        q: 'Is Neuridion validated for use in a QMS?',
        a: 'Neuridion provides append-only audit trails, immutable classification records, and PRRC review enforcement. These features support integration into a QMS under ISO 13485. We recommend documenting the tool in your validation plan as a GAMP 5 Category 5 system with intended use limited to FSN screening support.',
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
                      <dd
                        className="text-sm text-[#475569] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: item.a }}
                      />
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
