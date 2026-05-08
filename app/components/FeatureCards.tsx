'use client'

import {
  DatabaseSearchIllustration,
  FilteringIllustration,
  ReportsIllustration,
  PRRCGateIllustration,
  SpeedIllustration,
  SecurityIllustration,
} from '@/components/ui/feature-illustrations'

const features = [
  {
    Illustration: DatabaseSearchIllustration,
    title: 'Multi-database search',
    desc: 'BfArM, FDA MAUDE, MHRA, and Swissmedic — searched in parallel. Define your search terms once, monitor continuously.',
  },
  {
    Illustration: FilteringIllustration,
    title: 'Intelligent filtering',
    desc: 'Each Field Safety Notice is classified as relevant, uncertain, or excluded against your device profile. Your PRRC reviews every decision.',
  },
  {
    Illustration: ReportsIllustration,
    title: 'Audit-ready reports',
    desc: 'PDF and Excel reports formatted for EU MDR compliance reviews. Timestamped, traceable, ready for your notified body.',
  },
  {
    Illustration: PRRCGateIllustration,
    title: 'PRRC review gate',
    desc: 'No result reaches your final report without human review. The tool assists — your Person Responsible decides.',
  },
  {
    Illustration: SpeedIllustration,
    title: 'Minutes, not days',
    desc: 'What used to take your team days of manual database searching now completes in minutes. Same thoroughness, fraction of the time.',
  },
  {
    Illustration: SecurityIllustration,
    title: 'Data security',
    desc: 'GDPR-compliant by design. Encrypted data, append-only audit logs, role-based access. No patient data leaves the EU.',
  },
]

export function FeatureCards() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {features.map(({ Illustration, title, desc }) => (
        <div
          key={title}
          className="rounded border border-[#E2E8F0] hover:border-[#0D9488] transition-colors overflow-hidden group"
        >
          <div className="bg-[#F0FDFA] border-b border-[#CCFBF1] px-4 py-4 group-hover:bg-[#CCFBF1] transition-colors">
            <Illustration />
          </div>
          <div className="p-5">
            <h3 className="text-base font-semibold text-[#0F1F3D] mb-2">
              {title}
            </h3>
            <p className="text-sm text-[#115E59] leading-relaxed">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
