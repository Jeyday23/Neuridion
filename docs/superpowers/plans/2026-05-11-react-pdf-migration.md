# @react-pdf/renderer Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Playwright (headless Chromium) PDF generation with `@react-pdf/renderer` to eliminate OOM risk on Render's 512MB tier.

**Architecture:** New React-PDF `<Document>` component in `lib/pdf/report-document.tsx` replicates the current HTML report layout. `lib/pdfshift.ts` is rewritten to call `renderToBuffer()` instead of Playwright. The route handler passes structured data instead of an HTML string. Quotas raised to 500/month global, 50/user.

**Tech Stack:** @react-pdf/renderer, React 19, TypeScript, Supabase Storage

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `lib/pdf/report-document.tsx` | React-PDF Document component with all 11 report sections |
| Rewrite | `lib/pdfshift.ts` | Remove Playwright, export `generateReportPdf(data)`, raise quotas |
| Modify | `app/api/reports/route.ts:5` | Change import to `generateReportPdf`, update call site at line 525 |
| Modify | `render.yaml:5` | Remove `npx playwright install --with-deps chromium` |
| Modify | `package.json:47` | Remove `playwright`, add `@react-pdf/renderer` |

---

### Task 1: Install @react-pdf/renderer and remove Playwright

**Files:**
- Modify: `package.json:47`
- Modify: `render.yaml:5`

- [ ] **Step 1: Install @react-pdf/renderer**

Run:

```bash
npm install @react-pdf/renderer
```

- [ ] **Step 2: Remove playwright**

Run:

```bash
npm uninstall playwright
```

- [ ] **Step 3: Revert render.yaml build command**

In `render.yaml`, change line 5 from:

```yaml
    buildCommand: npm install && npx playwright install --with-deps chromium && npm run build
```

to:

```yaml
    buildCommand: npm install && npm run build
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Errors in `lib/pdfshift.ts` (Playwright import missing). This is expected — we rewrite it in Task 3.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json render.yaml
git commit -m "chore: swap playwright for @react-pdf/renderer, clean render.yaml

Co-Authored-By: Neuridion"
```

---

### Task 2: Create React-PDF report document component

**Files:**
- Create: `lib/pdf/report-document.tsx`

This is the largest task. The component must match the current HTML report layout in `app/api/reports/route.ts:159-367` exactly.

- [ ] **Step 1: Create `lib/pdf/report-document.tsx`**

```tsx
import React from 'react'
import { Document, Page, Text, View, Link, Font, StyleSheet } from '@react-pdf/renderer'

// ─── Font registration ──────────────────────────────────────────────────────

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZhrib2Bg-4.ttf', fontWeight: 500 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf', fontWeight: 700 },
  ],
})

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FsnRow {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source_db: string
  raw_content: string
  filter_decision: {
    decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
    rationale: string
    confidence: number | null
  } | null
}

export interface ReportData {
  profile: {
    device_name: string
    manufacturer: string
    device_class: string | null
    emdn_code: string | null
  }
  run: { period_from: string; period_to: string }
  rows: FsnRow[]
  runId: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DECISION_LABEL: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Further Review',
  excluded:      'Not Relevant',
  filter_failed: 'AI Filter Unavailable',
}

const SOURCE_LABELS: Record<string, string> = {
  bfarm: 'BfArM',
  maude: 'FDA MAUDE',
  mhra:  'MHRA',
}

function fmtSourceDb(src: string): string {
  return SOURCE_LABELS[src?.toLowerCase()] ?? src?.toUpperCase() ?? 'BfArM'
}

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
    fontFamily: 'Inter',
    fontSize: 10.5,
    color: '#1a1a1a',
    paddingTop: '2.2cm',
    paddingBottom: '2.5cm',
    paddingHorizontal: '2cm',
  },
  // Header
  headerBar: { borderBottomWidth: 2.5, borderBottomColor: NAVY, paddingBottom: 10, marginBottom: 18 },
  orgLine: { fontSize: 8, color: '#666', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 4 },
  docTitle: { fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.4, color: NAVY },
  docSubtitle: { fontSize: 10, color: '#444', marginTop: 3 },
  // Section heading
  h2: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, borderBottomWidth: 1, borderBottomColor: '#bbb', paddingBottom: 3, marginTop: 20, marginBottom: 8, color: NAVY },
  // Meta table
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { width: 180, fontWeight: 'bold', color: '#333', fontSize: 9.5, paddingVertical: 3 },
  metaValue: { flex: 1, fontSize: 9.5, paddingVertical: 3 },
  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 16, marginVertical: 10 },
  statBox: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: NAVY },
  statLabel: { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  // Section bar
  sectionBar: { padding: '5 10', color: '#fff', fontWeight: 'bold', fontSize: 9, letterSpacing: 0.3, marginTop: 24, marginBottom: 6 },
  // Results table
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY },
  tableTh: { color: '#fff', fontWeight: 'bold', fontSize: 8, letterSpacing: 0.2, padding: '5 7' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e4e4e4' },
  tableTd: { fontSize: 8.5, padding: '5 7', lineHeight: 1.35 },
  // Appendix table
  appendixHeader: { flexDirection: 'row', backgroundColor: GREY },
  appendixTh: { color: '#fff', fontWeight: 'bold', fontSize: 7.5, padding: '4 7' },
  appendixTd: { fontSize: 8, padding: '4 7', lineHeight: 1.3 },
  // Warning banner
  warningBanner: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', padding: '6 10', fontSize: 8.5, color: '#991b1b', marginVertical: 4 },
  appendixNote: { fontSize: 8, color: '#666', fontStyle: 'italic', marginVertical: 4 },
  // Conclusion
  conclusion: { fontStyle: 'italic', color: '#333', lineHeight: 1.6, fontSize: 9.5 },
  // Signature grid
  sigGrid: { flexDirection: 'row', gap: 20, marginTop: 10 },
  sigBox: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: '10 12', minHeight: 52 },
  sigLabel: { fontWeight: 'bold', color: '#333', fontSize: 8.5, marginBottom: 3 },
  sigLine: { fontSize: 8.5, color: '#666' },
  // Disclaimer
  disclaimer: { marginTop: 40, fontSize: 7.5, color: '#666', borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 6, lineHeight: 1.5 },
  // Empty row
  emptyCell: { padding: '8 7', color: '#888', fontStyle: 'italic' },
  // Link
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
    <View style={[s.statBox, color ? { borderColor: color } : undefined]}>
      <Text style={[s.statNum, color ? { color } : undefined]}>{num}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function ResultsTable({ items, bgColor, isAppendix }: { items: FsnRow[]; bgColor: string; isAppendix?: boolean }) {
  if (items.length === 0) {
    const colspan = isAppendix ? 4 : 5
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
          <Text style={s.docSubtitle}>Database Search & Assessment</Text>
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
        <Text style={s.h2}>Review & Approval</Text>
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
```

- [ ] **Step 2: Verify TypeScript (will still fail due to pdfshift.ts)**

Run: `npx tsc --noEmit 2>&1 | grep -v pdfshift | head -10`

Expected: No errors from `report-document.tsx`.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/report-document.tsx
git commit -m "feat(pdf): add React-PDF report document component

Replicates the current HTML report layout with all 11 sections:
header, meta tables, stats grid, color-coded section bars,
results tables, appendix, conclusion, signatures, AI disclaimer.

Co-Authored-By: Neuridion"
```

---

### Task 3: Rewrite lib/pdfshift.ts

**Files:**
- Rewrite: `lib/pdfshift.ts`

- [ ] **Step 1: Replace entire file**

Replace all contents of `lib/pdfshift.ts` with:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ReportDocument, type ReportData } from '@/lib/pdf/report-document'

const MONTHLY_LIMIT = 500
const PER_USER_LIMIT = 50

export type { ReportData }

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const buffer = await renderToBuffer(React.createElement(ReportDocument, { data }))
  return Buffer.from(buffer)
}

export async function canGeneratePdf(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const month = new Date().toISOString().slice(0, 7)

  const { data: allUsage } = await adminClient
    .from('pdf_usage')
    .select('count')
    .eq('month', month)

  const totalThisMonth = (allUsage ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
  if (totalThisMonth >= MONTHLY_LIMIT) {
    return { allowed: false, reason: 'monthly_limit_reached' }
  }

  const { data: userUsage } = await adminClient
    .from('pdf_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle()

  if (userUsage && (userUsage as { count: number }).count >= PER_USER_LIMIT) {
    return { allowed: false, reason: 'user_limit_reached' }
  }

  return { allowed: true }
}

export async function incrementPdfUsage(
  adminClient: SupabaseClient,
  userId: string
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7)
  await adminClient.rpc('increment_pdf_usage', { p_user_id: userId, p_month: month })
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Errors in `app/api/reports/route.ts` because `generatePdfFromHtml` no longer exists. This is expected — fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add lib/pdfshift.ts
git commit -m "feat(pdf): rewrite pdfshift.ts — Playwright → @react-pdf/renderer

- Remove Playwright browser singleton
- Export generateReportPdf(data) using renderToBuffer
- Raise quotas: 45→500 monthly, 15→50 per user

Co-Authored-By: Neuridion"
```

---

### Task 4: Update reports route to use new PDF generator

**Files:**
- Modify: `app/api/reports/route.ts:5,525`

- [ ] **Step 1: Update import**

In `app/api/reports/route.ts` line 5, change:

```typescript
import { generatePdfFromHtml, canGeneratePdf, incrementPdfUsage } from '@/lib/pdfshift'
```

to:

```typescript
import { generateReportPdf, canGeneratePdf, incrementPdfUsage } from '@/lib/pdfshift'
```

- [ ] **Step 2: Update PDF generation call**

In `app/api/reports/route.ts` line 525, change:

```typescript
      const pdfBuffer = await generatePdfFromHtml(html)
```

to:

```typescript
      const pdfBuffer = await generateReportPdf({
        profile,
        run: { period_from: run.period_from, period_to: run.period_to },
        rows,
        runId: run_id,
      })
```

- [ ] **Step 3: Update comment**

In `app/api/reports/route.ts` line 516, change:

```typescript
  // ── Generate real PDF via PDFShift (quota-guarded) ───────────────────────────
```

to:

```typescript
  // ── Generate PDF via @react-pdf/renderer (quota-guarded) ────────────────────
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "feat(pdf): wire up generateReportPdf in reports route

Replace generatePdfFromHtml(html) with generateReportPdf(data).
PDF now generated from React components, not Playwright.

Co-Authored-By: Neuridion"
```

---

### Task 5: Final verification and push

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1`

Expected: No errors.

- [ ] **Step 2: Verify Playwright is gone**

Run: `grep -r 'playwright' package.json lib/ app/ --include='*.ts' --include='*.tsx' | grep -v node_modules`

Expected: No matches.

- [ ] **Step 3: Verify render.yaml is clean**

Run: `cat render.yaml`

Expected: Build command is `npm install && npm run build` (no Playwright install).

- [ ] **Step 4: Push**

```bash
git push origin main
```
