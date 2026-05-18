'use client'

import { StaggerContainer, StaggerItem } from './ui/motion'

const FSN_EXAMPLES = [
  {
    source: 'BfArM',
    date: '12 Mar 2026',
    title: 'FSCA: Battery overheating in patient monitoring system during extended use',
    manufacturer: 'Drägerwerk AG',
    deviceClass: 'Patient monitor (Class IIb)',
    decision: 'relevant' as const,
    rationale: 'Same device class and intended use. Battery subsystem overlap with your device profile.',
    confidence: 94,
  },
  {
    source: 'MHRA',
    date: '28 Feb 2026',
    title: 'Medical Device Alert: Software defect in vital signs display during SpO2 monitoring',
    manufacturer: 'Philips Healthcare',
    deviceClass: 'Vital signs monitor (Class IIb)',
    decision: 'relevant' as const,
    rationale: 'Equivalent device function. SpO2 display error relevant to patient monitoring safety.',
    confidence: 87,
  },
  {
    source: 'FDA MAUDE',
    date: '15 Feb 2026',
    title: 'Adverse event report: Intermittent network connectivity loss in wireless patient telemetry',
    manufacturer: 'GE HealthCare',
    deviceClass: 'Wireless telemetry system (Class IIa)',
    decision: 'uncertain' as const,
    rationale: 'Different device class, but shared wireless protocol. PRRC review recommended.',
    confidence: 52,
  },
  {
    source: 'Swissmedic',
    date: '03 Jan 2026',
    title: 'FSCA: Updated labelling for single-use endoscopic stapler cartridges',
    manufacturer: 'Ethicon (Johnson & Johnson)',
    deviceClass: 'Surgical stapler (Class IIb)',
    decision: 'excluded' as const,
    rationale: 'Surgical device, unrelated device class and intended use. No overlap with patient monitoring.',
    confidence: 97,
  },
]

const DECISION_STYLES = {
  relevant: { badge: 'bg-[#dcfce7] text-[#166534]', bg: 'bg-[#f0fdf9]' },
  uncertain: { badge: 'bg-[#fef3c7] text-[#92400e]', bg: 'bg-[#fffbeb]' },
  excluded: { badge: 'bg-[#f1f5f9] text-[#64748b]', bg: 'bg-[#f8fafc]' },
}

export function FsnExamples() {
  return (
    <StaggerContainer className="grid md:grid-cols-2 gap-5">
      {FSN_EXAMPLES.map((fsn) => {
        const style = DECISION_STYLES[fsn.decision]
        return (
          <StaggerItem key={fsn.title}>
            <div className="bg-white border border-[#dfe3ea] rounded-md overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f0f2f5]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider">
                    {fsn.source}
                  </span>
                  <span className="text-[11px] text-[#c4cad4] font-mono">
                    {fsn.date}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[#0F1F3D] leading-snug mb-1.5">
                  {fsn.title}
                </div>
                <div className="text-xs text-[#7a8599]">{fsn.manufacturer} · {fsn.deviceClass}</div>
              </div>
              <div className={`px-5 py-3 flex items-center justify-between ${style.bg}`}>
                <div>
                  <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${style.badge}`}>
                    {fsn.decision.charAt(0).toUpperCase() + fsn.decision.slice(1)}
                  </span>
                  <p className="text-[11px] text-[#3d4a5c] mt-1.5 leading-relaxed max-w-[280px]">
                    {fsn.rationale}
                  </p>
                </div>
                <span className="text-[11px] text-[#7a8599] font-mono flex-shrink-0 ml-3" title="How closely this FSN matches your device profile">
                  {fsn.confidence}% match
                </span>
              </div>
            </div>
          </StaggerItem>
        )
      })}
    </StaggerContainer>
  )
}
