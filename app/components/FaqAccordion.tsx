'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    question: 'What databases does Neuridion search?',
    answer: 'Neuridion searches 20+ global medical device databases including FDA MAUDE (USA), BfArM (Germany), Swissmedic (Switzerland), EUDAMED (EU), MHRA (UK), and many more. We\'re continuously adding new databases.',
  },
  {
    question: 'How accurate is the AI filtering?',
    answer: 'Our AI uses Claude to analyze Field Safety Notices and filter them based on your specific device profile. The system achieves 95%+ accuracy in identifying relevant recalls, significantly reducing manual review time.',
  },
  {
    question: 'Is Neuridion MDR compliant?',
    answer: 'Yes, Neuridion is built specifically for EU MDR Article 83 compliance. Our reports are formatted to meet regulatory requirements and include full audit trails for documentation purposes.',
  },
  {
    question: 'Can I export reports for audits?',
    answer: 'Absolutely. All search results can be exported as PDF reports formatted for MDR compliance documentation. Reports include timestamps, search criteria, and full result details.',
  },
  {
    question: 'Do you offer a free trial?',
    answer: 'Yes! Our Free plan includes 1 device profile and 5 searches per month. No credit card required. Upgrade anytime as your needs grow.',
  },
]

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="space-y-4">
      {faqs.map((faq, i) => (
        <div key={i} className="border border-slate-200 rounded-lg">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
          >
            <span className="font-semibold text-slate-900">{faq.question}</span>
            <ChevronDown
              className={`w-5 h-5 text-slate-400 transition-transform ${open === i ? 'rotate-180' : ''}`}
            />
          </button>
          {open === i && (
            <div className="px-6 pb-4 text-slate-600">{faq.answer}</div>
          )}
        </div>
      ))}
    </div>
  )
}
