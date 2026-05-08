'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    question: 'What databases does Neuridion search?',
    answer: 'Neuridion currently searches 4 major regulatory databases: FDA MAUDE (USA), BfArM (Germany), MHRA (UK), and Swissmedic (Switzerland). We\'re actively working to add more sources.',
  },
  {
    question: 'How accurate is the AI filtering?',
    answer: 'Our AI uses Claude to classify each Field Safety Notice as relevant, uncertain, or excluded based on your device profile. Every AI decision goes through a PRRC review gate before appearing in your final report — AI assists, humans decide.',
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
    answer: 'Yes! Every paid plan includes a 14-day free trial. No credit card required to start. You get full access to all features during the trial period.',
  },
]

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="space-y-4">
      {faqs.map((faq, i) => (
        <div key={i} className="border border-slate-200 rounded-md">
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
            <div className="px-6 pb-4 text-[#0F766E]">{faq.answer}</div>
          )}
        </div>
      ))}
    </div>
  )
}
