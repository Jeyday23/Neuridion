import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sample PMS Report — Neuridion',
  description: 'See what a Neuridion Field Safety Notice review report looks like before you sign up.',
}

export default function SampleReportPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-[900px] mx-auto px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
              ← Back to homepage
            </Link>
            <h1 className="text-lg font-semibold text-zinc-900 mt-2">Sample PMS Report</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              This is an example of the report Neuridion generates after a PMS database search.
              All data shown is illustrative.
            </p>
          </div>
          <Link
            href="/signup"
            className="rounded bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B7C72] transition-colors"
          >
            Start free trial
          </Link>
        </div>

        {/* Report preview */}
        <div className="bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-10 font-['Georgia',serif] text-[10.5pt] text-[#1a1a1a] leading-relaxed">

            {/* Header */}
            <div className="border-b-[2.5px] border-[#1a1a2e] pb-2.5 mb-5">
              <div className="text-[8pt] text-zinc-500 uppercase tracking-wider mb-1">Post-Market Surveillance</div>
              <div className="text-[15pt] font-bold uppercase tracking-wide text-[#1a1a2e]">Field Safety Notice Review Report</div>
              <div className="text-[10pt] text-zinc-600 mt-0.5">Database Search &amp; Assessment</div>
            </div>

            {/* 1. Document Information */}
            <h2 className="text-[10pt] font-bold uppercase tracking-wider border-b border-zinc-300 pb-1 mt-5 mb-2 text-[#1a1a2e]">1. Document Information</h2>
            <table className="w-full text-[9.5pt] mb-4">
              <tbody>
                <MetaRow label="Device Name" value="InfusoGuard 3000 Patient Monitor" />
                <MetaRow label="Manufacturer" value="MedTechnik GmbH" />
                <MetaRow label="Device Classification" value="Class IIb" />
                <MetaRow label="EMDN Code" value="Z12030101" />
                <MetaRow label="Review Period" value="2025-06-01 to 2026-05-01" />
                <MetaRow label="Report Date" value="17 May 2026" />
                <MetaRow label="Document Reference" value="PMS-FSN-2026-A7C3E1D2" />
              </tbody>
            </table>

            {/* 2. Search Methodology */}
            <h2 className="text-[10pt] font-bold uppercase tracking-wider border-b border-zinc-300 pb-1 mt-5 mb-2 text-[#1a1a2e]">2. Search Methodology</h2>
            <table className="w-full text-[9.5pt] mb-4">
              <tbody>
                <MetaRow label="Databases Searched" value="BfArM, FDA MAUDE, MHRA, Swissmedic" />
                <MetaRow label="Search Date Range" value="2025-06-01 to 2026-05-01" />
                <MetaRow label="Manufacturer Terms">
                  <span className="inline-block bg-[#dcfce7] px-1.5 py-0.5 rounded text-[9pt] font-mono mr-1">medtechnik</span>
                  <span className="inline-block bg-[#dcfce7] px-1.5 py-0.5 rounded text-[9pt] font-mono mr-1">infusoguard</span>
                  <span className="text-zinc-400 text-[8.5pt]">(derived from &ldquo;MedTechnik GmbH&rdquo;)</span>
                </MetaRow>
                <MetaRow label="Device Terms">
                  <span className="inline-block bg-[#dcfce7] px-1.5 py-0.5 rounded text-[9pt] font-mono mr-1">patient</span>
                  <span className="inline-block bg-[#dcfce7] px-1.5 py-0.5 rounded text-[9pt] font-mono mr-1">monitor</span>
                  <span className="text-zinc-400 text-[8.5pt]">(derived from &ldquo;InfusoGuard 3000 Patient Monitor&rdquo;)</span>
                </MetaRow>
                <MetaRow label="Assessment Criteria" value="Each notice was evaluated for device type, manufacturer, intended use, and applicable risk." />
              </tbody>
            </table>

            {/* 3. Results Summary */}
            <h2 className="text-[10pt] font-bold uppercase tracking-wider border-b border-zinc-300 pb-1 mt-5 mb-2 text-[#1a1a2e]">3. Search Results Summary</h2>
            <div className="flex gap-4 my-3">
              <StatBox num={47} label="Total Reviewed" />
              <StatBox num={3} label="Potentially Relevant" color="#16a34a" />
              <StatBox num={2} label="Requires Review" color="#d97706" />
              <StatBox num={42} label="Not Relevant" color="#9ca3af" />
            </div>

            {/* 4. Potentially Relevant */}
            <div className="mt-6 py-1.5 px-3 bg-[#16a34a] text-white text-[9pt] font-bold tracking-wide">
              POTENTIALLY RELEVANT — 3 items
            </div>
            <table className="w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="bg-[#1a1a2e] text-white text-[8pt] font-bold">
                  <th className="py-1.5 px-2 text-left w-[30%]">Title</th>
                  <th className="py-1.5 px-2 text-left w-[16%]">Manufacturer</th>
                  <th className="py-1.5 px-2 text-left w-[9%]">Date</th>
                  <th className="py-1.5 px-2 text-left w-[7%]">Source</th>
                  <th className="py-1.5 px-2 text-left">Rationale</th>
                </tr>
              </thead>
              <tbody>
                <ResultRow
                  bg="#f0fdf4"
                  title="FSCA: Battery overheating in patient monitoring system during extended use"
                  manufacturer="Drägerwerk AG"
                  date="12 Mar 2026"
                  source="BfArM"
                  rationale="Same device class (IIb) and intended use (patient monitoring). Battery subsystem overlap with InfusoGuard 3000. EMDN match at Z1203 group level."
                />
                <ResultRow
                  bg="#f0fdf4"
                  title="Medical Device Alert: Software defect in vital signs display during SpO2 monitoring"
                  manufacturer="Philips Healthcare"
                  date="28 Feb 2026"
                  source="MHRA"
                  rationale="Equivalent device function (vital signs monitoring). SpO2 display error relevant to patient monitoring safety. Same intended clinical setting."
                />
                <ResultRow
                  bg="#f0fdf4"
                  title="FSCA: Alarm volume reduction after firmware update in bedside monitoring systems"
                  manufacturer="Nihon Kohden"
                  date="15 Jan 2026"
                  source="BfArM"
                  rationale="Same device category (bedside patient monitor, Class IIb). Alarm system is a shared critical function. Firmware update mechanism may be architecturally similar."
                />
              </tbody>
            </table>

            {/* 5. Requires Further Review */}
            <div className="mt-6 py-1.5 px-3 bg-[#d97706] text-white text-[9pt] font-bold tracking-wide">
              REQUIRES FURTHER REVIEW — 2 items
            </div>
            <table className="w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="bg-[#1a1a2e] text-white text-[8pt] font-bold">
                  <th className="py-1.5 px-2 text-left w-[30%]">Title</th>
                  <th className="py-1.5 px-2 text-left w-[16%]">Manufacturer</th>
                  <th className="py-1.5 px-2 text-left w-[9%]">Date</th>
                  <th className="py-1.5 px-2 text-left w-[7%]">Source</th>
                  <th className="py-1.5 px-2 text-left">Rationale</th>
                </tr>
              </thead>
              <tbody>
                <ResultRow
                  bg="#fffbeb"
                  title="Adverse event report: Intermittent network connectivity loss in wireless patient telemetry"
                  manufacturer="GE HealthCare"
                  date="15 Feb 2026"
                  source="FDA MAUDE"
                  rationale="Different device class (IIa telemetry vs IIb monitor), but shared wireless protocol (IEEE 802.11). Network connectivity failure mode may apply if InfusoGuard 3000 uses wireless data transmission. PRRC review recommended."
                />
                <ResultRow
                  bg="#fffbeb"
                  title="FSCA: Incorrect ECG lead placement detection in multi-parameter monitors"
                  manufacturer="Mindray Medical"
                  date="09 Nov 2025"
                  source="Swissmedic"
                  rationale="Multi-parameter monitor with ECG capability. If InfusoGuard 3000 includes ECG functionality, the lead detection algorithm may share similar design patterns. Requires verification of InfusoGuard feature set."
                />
              </tbody>
            </table>

            {/* Appendix A */}
            <div className="mt-6 py-1.5 px-3 bg-[#6b7280] text-white text-[9pt] font-bold tracking-wide">
              APPENDIX A — EXCLUDED FSNs — 42 items
            </div>
            <p className="text-[8pt] text-zinc-500 italic my-1.5">
              These items were reviewed and determined not relevant to the device profile. Listed for audit completeness.
              Showing first 3 of 42 for this sample.
            </p>
            <table className="w-full border-collapse text-[8pt]">
              <thead>
                <tr className="bg-[#6b7280] text-white text-[7.5pt] font-bold">
                  <th className="py-1 px-2 text-left w-[35%]">Title</th>
                  <th className="py-1 px-2 text-left w-[18%]">Manufacturer</th>
                  <th className="py-1 px-2 text-left w-[10%]">Date</th>
                  <th className="py-1 px-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                <AppendixRow
                  title="FSCA: Updated labelling for single-use endoscopic stapler cartridges"
                  manufacturer="Ethicon (J&J)"
                  date="03 Jan 2026"
                  notes="Surgical device, unrelated device class and intended use. No overlap with patient monitoring."
                />
                <AppendixRow
                  title="FSCA: Recall of specific lot numbers of orthopaedic bone cement"
                  manufacturer="Heraeus Medical"
                  date="18 Dec 2025"
                  notes="Orthopaedic implant material. No device type, clinical domain, or mechanism overlap."
                />
                <AppendixRow
                  title="FSCA: IVD reagent shelf life reduction for HbA1c test kits"
                  manufacturer="Roche Diagnostics"
                  date="02 Dec 2025"
                  notes="In-vitro diagnostic reagent. Different regulatory framework (IVDR, not MDR). No relevance."
                />
                <tr>
                  <td colSpan={4} className="py-2 px-2 text-zinc-400 italic text-center">
                    ... 39 more excluded items in full report
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Conclusion */}
            <h2 className="text-[10pt] font-bold uppercase tracking-wider border-b border-zinc-300 pb-1 mt-8 mb-2 text-[#1a1a2e]">Conclusion</h2>
            <p className="text-[9.5pt] italic text-zinc-700 leading-relaxed">
              This review identified 5 Field Safety Notices requiring attention (3 potentially relevant, 2 requiring
              further review). 42 notices were assessed as not relevant and excluded from further review.
              Appropriate follow-up actions should be taken in accordance with the applicable post-market surveillance plan.
            </p>

            {/* Signature */}
            <h2 className="text-[10pt] font-bold uppercase tracking-wider border-b border-zinc-300 pb-1 mt-6 mb-2 text-[#1a1a2e]">Review &amp; Approval</h2>
            <div className="grid grid-cols-2 gap-5 mt-3">
              <div className="border border-zinc-300 p-3 min-h-[52px] text-[8.5pt] text-zinc-500">
                <span className="font-bold text-zinc-800 block mb-1">Prepared by</span>
                Name: ___________________________<br />
                Date: ___________________________
              </div>
              <div className="border border-zinc-300 p-3 min-h-[52px] text-[8.5pt] text-zinc-500">
                <span className="font-bold text-zinc-800 block mb-1">Reviewed by (PRRC)</span>
                Name: ___________________________<br />
                Date: ___________________________
              </div>
            </div>

            {/* Disclaimer */}
            <p className="mt-10 text-[7.5pt] text-zinc-400 border-t border-zinc-200 pt-2 leading-relaxed">
              <strong>AI Disclaimer:</strong> Relevance assessments in this report were produced by an AI language
              model (Anthropic Claude) and must be reviewed and approved by a qualified Person Responsible for
              Regulatory Compliance (PRRC) before inclusion in any Technical File, PMSR, or PSUR. AI outputs
              do not constitute a regulatory decision.
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-zinc-500 mb-3">
            Reports are available as PDF, Word (.docx), and Excel. Word format is editable for integration into your Technical File.
          </p>
          <Link
            href="/signup"
            className="rounded bg-[#0D9488] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#0B7C72] transition-colors"
          >
            Try Neuridion free for 14 days
          </Link>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <tr>
      <td className="py-0.5 font-bold text-zinc-700 w-[180px] align-top">{label}</td>
      <td className="py-0.5">{children ?? value}</td>
    </tr>
  )
}

function StatBox({ num, label, color }: { num: number; label: string; color?: string }) {
  return (
    <div className="border border-zinc-200 rounded px-4 py-2 text-center flex-1" style={color ? { borderColor: color } : {}}>
      <div className="text-[20pt] font-bold text-[#1a1a2e]" style={color ? { color } : {}}>{num}</div>
      <div className="text-[7.5pt] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}

function ResultRow({ bg, title, manufacturer, date, source, rationale }: {
  bg: string; title: string; manufacturer: string; date: string; source: string; rationale: string
}) {
  return (
    <tr style={{ backgroundColor: bg }}>
      <td className="py-1.5 px-2 border-b border-zinc-200 align-top">{title}</td>
      <td className="py-1.5 px-2 border-b border-zinc-200 align-top">{manufacturer}</td>
      <td className="py-1.5 px-2 border-b border-zinc-200 align-top whitespace-nowrap">{date}</td>
      <td className="py-1.5 px-2 border-b border-zinc-200 align-top">{source}</td>
      <td className="py-1.5 px-2 border-b border-zinc-200 align-top text-zinc-600">{rationale}</td>
    </tr>
  )
}

function AppendixRow({ title, manufacturer, date, notes }: {
  title: string; manufacturer: string; date: string; notes: string
}) {
  return (
    <tr className="bg-[#f9fafb]">
      <td className="py-1 px-2 border-b border-zinc-200 align-top">{title}</td>
      <td className="py-1 px-2 border-b border-zinc-200 align-top">{manufacturer}</td>
      <td className="py-1 px-2 border-b border-zinc-200 align-top whitespace-nowrap">{date}</td>
      <td className="py-1 px-2 border-b border-zinc-200 align-top text-zinc-500">{notes}</td>
    </tr>
  )
}
