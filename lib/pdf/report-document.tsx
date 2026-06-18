import React from 'react'
import { Document, Page, Text, View, Link, StyleSheet } from '@react-pdf/renderer'
import { fmtSourceDb } from '@/lib/domain/source-labels'
import type { FsnReportRow } from '@/lib/domain/types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReportData {
  profile: {
    device_name: string
    manufacturer: string
    device_class: string | null
    emdn_code: string | null
  }
  run: { period_from: string; period_to: string }
  rows: FsnReportRow[]
  runId: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const NAVY = '#1a1a2e'
const GREEN = '#16a34a'
const AMBER = '#d97706'
const GREY = '#6b7280'
const RED = '#dc2626'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    color: '#1a1a1a',
    paddingTop: '2.2cm',
    paddingBottom: '2.5cm',
    paddingHorizontal: '2cm',
  },
  headerBar: { borderBottomWidth: 2.5, borderBottomColor: NAVY, paddingBottom: 10, marginBottom: 18 },
  orgLine: { fontSize: 8, color: '#666', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 4 },
  docTitle: { fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.4, color: NAVY },
  docSubtitle: { fontSize: 10, color: '#444', marginTop: 3 },
  h2: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, borderBottomWidth: 1, borderBottomColor: '#bbb', paddingBottom: 3, marginTop: 20, marginBottom: 8, color: NAVY },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { width: 180, fontWeight: 'bold', color: '#333', fontSize: 9.5, paddingVertical: 3 },
  metaValue: { flex: 1, fontSize: 9.5, paddingVertical: 3 },
  statsGrid: { flexDirection: 'row', gap: 16, marginVertical: 10 },
  statBox: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: NAVY },
  statLabel: { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  sectionBar: { padding: '5 10', color: '#fff', fontWeight: 'bold', fontSize: 9, letterSpacing: 0.3, marginTop: 24, marginBottom: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY },
  tableTh: { color: '#fff', fontWeight: 'bold', fontSize: 8, letterSpacing: 0.2, padding: '5 7' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e4e4e4' },
  tableTd: { fontSize: 8.5, padding: '5 7', lineHeight: 1.35 },
  appendixHeader: { flexDirection: 'row', backgroundColor: GREY },
  appendixTh: { color: '#fff', fontWeight: 'bold', fontSize: 7.5, padding: '4 7' },
  appendixTd: { fontSize: 8, padding: '4 7', lineHeight: 1.3 },
  warningBanner: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', padding: '6 10', fontSize: 8.5, color: '#991b1b', marginVertical: 4 },
  appendixNote: { fontSize: 8, color: '#666', marginVertical: 4 },
  conclusion: { color: '#333', lineHeight: 1.6, fontSize: 9.5 },
  sigGrid: { flexDirection: 'row', gap: 20, marginTop: 10 },
  sigBox: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: '10 12', minHeight: 52 },
  sigLabel: { fontWeight: 'bold', color: '#333', fontSize: 8.5, marginBottom: 3 },
  sigLine: { fontSize: 8.5, color: '#666' },
  disclaimer: { marginTop: 40, fontSize: 7.5, color: '#666', borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 6, lineHeight: 1.5 },
  emptyCell: { padding: '8 7', color: '#888' },
  link: { color: NAVY, textDecoration: 'none' },
})

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  )
}

function StatBox({ num, label, color }: { num: number; label: string; color?: string }) {
  return (
    <View style={[s.statBox, color ? { borderColor: color } : {}]}>
      <Text style={[s.statNum, color ? { color } : {}]}>{num}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function ResultsTable({ items, bgColor, isAppendix }: { items: FsnReportRow[]; bgColor: string; isAppendix?: boolean }) {
  if (items.length === 0) {
    return (
      <View style={{ flexDirection: 'row' }}>
        <Text style={s.emptyCell}>No items in this section.</Text>
      </View>
    )
  }

  const ThStyle = isAppendix ? s.appendixTh : s.tableTh
  const TdStyle = isAppendix ? s.appendixTd : s.tableTd
  const HeaderStyle = isAppendix ? s.appendixHeader : s.tableHeader

  return (
    <View>
      <View style={HeaderStyle} fixed>
        <Text style={[ThStyle, { width: isAppendix ? '35%' : '30%' }]}>Title</Text>
        <Text style={[ThStyle, { width: isAppendix ? '18%' : '16%' }]}>Manufacturer</Text>
        <Text style={[ThStyle, { width: isAppendix ? '10%' : '9%' }]}>Date</Text>
        {!isAppendix && <Text style={[ThStyle, { width: '7%' }]}>Source</Text>}
        <Text style={[ThStyle, { flex: 1 }]}>{isAppendix ? 'Notes' : 'Rationale'}</Text>
      </View>
      {items.map((r) => {
        const d = r.filter_decision
        const raw = d?.decision === 'filter_failed'
          ? 'AI filter could not be applied — manual review required.'
          : d?.rationale ?? ''
        const rationale = isAppendix && raw.length > 120 ? raw.slice(0, 120) + '…' : raw
        return (
          <View key={r.id} style={[s.tableRow, { backgroundColor: bgColor }]} wrap={false}>
            <View style={[TdStyle, { width: isAppendix ? '35%' : '30%' }]}>
              {r.source_url ? (
                <Link src={r.source_url} style={s.link}><Text>{r.title}</Text></Link>
              ) : (
                <Text>{r.title}</Text>
              )}
            </View>
            <Text style={[TdStyle, { width: isAppendix ? '18%' : '16%' }]}>{r.manufacturer || '—'}</Text>
            <Text style={[TdStyle, { width: isAppendix ? '10%' : '9%' }]}>{fmtDate(r.fsn_date)}</Text>
            {!isAppendix && <Text style={[TdStyle, { width: '7%' }]}>{fmtSourceDb(r.source_db)}</Text>}
            <Text style={[TdStyle, { flex: 1, fontSize: isAppendix ? 7.5 : 8, color: '#555' }]}>{rationale}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Main Document ──────────────────────────────────────────────────────────

export function ReportDocument({ data }: { data: ReportData }) {
  const { profile, run, rows, runId } = data
  const today = fmtDate(new Date().toISOString())

  const relevant     = rows.filter((r) => r.filter_decision?.decision === 'relevant')
  const uncertain    = rows.filter((r) => r.filter_decision?.decision === 'uncertain')
  const excluded     = rows.filter((r) => r.filter_decision?.decision === 'excluded')
  const filterFailed = rows.filter((r) => r.filter_decision?.decision === 'filter_failed')

  const conclusionRelevant = relevant.length + uncertain.length
  const failedNote = filterFailed.length > 0
    ? ` Note: The AI filter could not be applied to ${filterFailed.length} item${filterFailed.length !== 1 ? 's' : ''} due to API unavailability — these require manual review.`
    : ''
  const conclusionText = conclusionRelevant === 0 && filterFailed.length === 0
    ? 'This review identified no Field Safety Notices that are potentially relevant to the device under review within the specified period. No further action is required at this time.'
    : `This review identified ${conclusionRelevant + filterFailed.length} Field Safety Notice${(conclusionRelevant + filterFailed.length) !== 1 ? 's' : ''} requiring attention (${relevant.length} potentially relevant, ${uncertain.length} requiring further review${filterFailed.length > 0 ? `, ${filterFailed.length} AI filter unavailable` : ''}). ${excluded.length > 0 ? `${excluded.length} notice${excluded.length !== 1 ? 's were' : ' was'} assessed as not relevant and excluded from further review. ` : ''}Appropriate follow-up actions should be taken in accordance with the applicable post-market surveillance plan.${failedNote}`

  const databases = [...new Set(rows.map((r) => fmtSourceDb(r.source_db)))].join(', ')

  return (
    <Document title="FSN Review Report" author="Neuridion" creator="Neuridion">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerBar}>
          <Text style={s.orgLine}>Post-Market Surveillance</Text>
          <Text style={s.docTitle}>Field Safety Notice Review Report</Text>
          <Text style={s.docSubtitle}>Database Search &amp; Assessment</Text>
        </View>

        {/* 1. Document Information */}
        <Text style={s.h2}>1. Document Information</Text>
        <MetaRow label="Device Name" value={profile.device_name} />
        <MetaRow label="Manufacturer" value={profile.manufacturer} />
        {profile.device_class && <MetaRow label="Device Classification" value={profile.device_class} />}
        {profile.emdn_code && <MetaRow label="EMDN Code" value={profile.emdn_code} />}
        <MetaRow label="Review Period" value={`${run.period_from} to ${run.period_to}`} />
        <MetaRow label="Report Date" value={today} />
        <MetaRow label="Document Reference" value={`PMS-FSN-${new Date().getFullYear()}-${runId.slice(0, 8).toUpperCase()}`} />

        {/* 2. Search Methodology */}
        <Text style={s.h2}>2. Search Methodology</Text>
        <MetaRow label="Databases Searched" value={databases} />
        <MetaRow label="Search Date Range" value={`${run.period_from} to ${run.period_to}`} />
        <MetaRow label="Search Parameters" value="All published FSNs within the specified period were retrieved and assessed for relevance to the device profile above." />
        <MetaRow label="Assessment Criteria" value="Each notice was evaluated for device type, manufacturer, intended use, and applicable risk." />

        {/* 3. Search Results Summary */}
        <Text style={s.h2}>3. Search Results Summary</Text>
        <View style={s.statsGrid}>
          <StatBox num={rows.length} label="Total Reviewed" />
          <StatBox num={relevant.length} label="Potentially Relevant" color={GREEN} />
          <StatBox num={uncertain.length} label="Requires Review" color={AMBER} />
          <StatBox num={excluded.length} label="Not Relevant" color="#9ca3af" />
          {filterFailed.length > 0 && <StatBox num={filterFailed.length} label="AI Filter Unavailable" color={RED} />}
        </View>

        {/* 4. Potentially Relevant */}
        <View style={[s.sectionBar, { backgroundColor: GREEN }]}>
          <Text>POTENTIALLY RELEVANT — {relevant.length} item{relevant.length !== 1 ? 's' : ''}</Text>
        </View>
        <ResultsTable items={relevant} bgColor="#f0fdf4" />

        {/* 5. Requires Further Review */}
        <View style={[s.sectionBar, { backgroundColor: AMBER }]}>
          <Text>REQUIRES FURTHER REVIEW — {uncertain.length} item{uncertain.length !== 1 ? 's' : ''}</Text>
        </View>
        <ResultsTable items={uncertain} bgColor="#fffbeb" />

        {/* 6. AI Filter Unavailable (conditional) */}
        {filterFailed.length > 0 && (
          <>
            <View style={[s.sectionBar, { backgroundColor: RED }]}>
              <Text>AI FILTER UNAVAILABLE — {filterFailed.length} item{filterFailed.length !== 1 ? 's' : ''}</Text>
            </View>
            <Text style={s.warningBanner}>⚠ These items could not be AI-filtered. Manual review required.</Text>
            <ResultsTable items={filterFailed} bgColor="#fef2f2" />
          </>
        )}

        {/* Appendix A: Excluded FSNs */}
        {excluded.length > 50 && (
          <Text style={[s.appendixNote, { marginTop: 24 }]}>This appendix lists {excluded.length} excluded FSNs for audit completeness.</Text>
        )}
        <View style={[s.sectionBar, { backgroundColor: GREY }]}>
          <Text>APPENDIX A — EXCLUDED FSNs — {excluded.length} item{excluded.length !== 1 ? 's' : ''}</Text>
        </View>
        <Text style={s.appendixNote}>These items were reviewed and determined not relevant to the device profile. Listed for audit completeness.</Text>
        <ResultsTable items={excluded} bgColor="#f9fafb" isAppendix />

        {/* Conclusion */}
        <Text style={[s.h2, { marginTop: 36 }]}>Conclusion</Text>
        <Text style={s.conclusion}>{conclusionText}</Text>

        {/* Review & Approval */}
        <Text style={s.h2}>Review &amp; Approval</Text>
        <View style={s.sigGrid}>
          <View style={s.sigBox}>
            <Text style={s.sigLabel}>Prepared by</Text>
            <Text style={s.sigLine}>Name: ___________________________</Text>
            <Text style={s.sigLine}>Date: ___________________________</Text>
          </View>
          <View style={s.sigBox}>
            <Text style={s.sigLabel}>Reviewed by</Text>
            <Text style={s.sigLine}>Name: ___________________________</Text>
            <Text style={s.sigLine}>Date: ___________________________</Text>
          </View>
        </View>

        {/* AI Disclaimer */}
        <Text style={s.disclaimer}>
          AI Disclaimer: Relevance assessments in this report were produced by an AI language model (Anthropic Claude) and must be reviewed and approved by a qualified PRRC before inclusion in any Technical File, PMSR, or PSUR. AI outputs do not constitute a regulatory decision.
        </Text>
      </Page>
    </Document>
  )
}
