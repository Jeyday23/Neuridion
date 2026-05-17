# Word (.docx) Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Word (.docx) report export alongside existing PDF and Excel, gated to Starter+ plans.

**Architecture:** A new `buildDocx()` function in `lib/docx-report.ts` uses the `docx` npm package to produce a professional PMS report mirroring the PDF layout. The report generation route conditionally generates .docx for paid plans, uploads to Supabase Storage, and returns a signed URL. The download endpoint and frontend add `docx` as a format option.

**Tech Stack:** `docx` npm package, ExcelJS (existing), Supabase Storage, Next.js App Router

---

### Task 1: Install `docx` package

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the docx package**

```bash
npm install docx
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('docx'); console.log('docx OK')"
```

Expected: `docx OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add docx package for Word report export

Co-Authored-By: Neuridion"
```

---

### Task 2: Create `buildDocx()` function

**Files:**
- Create: `lib/docx-report.ts`

- [ ] **Step 1: Create the Word document builder**

Create `lib/docx-report.ts` with a `buildDocx()` function. It receives the same data as `buildExcel()` and produces a Buffer.

```typescript
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, BorderStyle,
  HeadingLevel, Footer, PageNumber, NumberFormat,
  ShadingType, TableLayoutType,
} from 'docx'

interface FsnRow {
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

interface ReportMeta {
  device: string
  manufacturer: string
  period_from: string
  period_to: string
  emdn_code?: string | null
  device_class?: string | null
  runId: string
}

const BRAND_NAVY = '0F1F3D'
const BRAND_TEAL = '0B7C72'
const DECISION_COLORS: Record<string, string> = {
  relevant:      '92D050',
  uncertain:     'FFCC00',
  excluded:      'D3D3D3',
  filter_failed: 'FF9999',
}
const DECISION_LABELS: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Further Review',
  excluded:      'Not Relevant',
  filter_failed: 'AI Filter Unavailable',
}
const SOURCE_LABELS: Record<string, string> = {
  bfarm: 'BfArM', maude: 'FDA MAUDE', mhra: 'MHRA', swissmedic: 'Swissmedic',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtSource(src: string): string {
  return SOURCE_LABELS[src?.toLowerCase()] ?? src?.toUpperCase() ?? 'BfArM'
}

function metaRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3000, type: WidthType.DXA },
        borders: noBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: 'Calibri' })] })],
      }),
      new TableCell({
        borders: noBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: 'Calibri' })] })],
      }),
    ],
  })
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: BRAND_NAVY },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18, font: 'Calibri' })],
    })],
  })
}

function textCell(text: string, size = 18): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: text || '—', size, font: 'Calibri' })],
    })],
  })
}

function buildFsnTable(items: FsnRow[], compact: boolean): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: compact
      ? [headerCell('Title'), headerCell('Manufacturer'), headerCell('Date'), headerCell('Rationale')]
      : [headerCell('Title'), headerCell('Manufacturer'), headerCell('Date'), headerCell('Source'), headerCell('Rationale'), headerCell('Confidence')],
  })

  const dataRows = items.map((r) => {
    const d = r.filter_decision
    const rationale = d?.rationale ?? '—'
    const displayRationale = compact && rationale.length > 120 ? rationale.slice(0, 120) + '…' : rationale
    const confidence = d?.confidence != null ? `${Math.round(d.confidence * 100)}%` : '—'
    const bg = d ? (DECISION_COLORS[d.decision] ?? 'FFFFFF') : 'FFFFFF'

    const cells = compact
      ? [textCell(r.title), textCell(r.manufacturer || '—'), textCell(fmtDate(r.fsn_date)), textCell(displayRationale, 16)]
      : [textCell(r.title), textCell(r.manufacturer || '—'), textCell(fmtDate(r.fsn_date)), textCell(fmtSource(r.source_db)), textCell(displayRationale, 16), textCell(confidence)]

    return new TableRow({
      children: cells.map((cell) => {
        cell.properties = { ...cell.properties, shading: { type: ShadingType.SOLID, color: bg } }
        return cell
      }),
    })
  })

  if (items.length === 0) {
    const cols = compact ? 4 : 6
    dataRows.push(new TableRow({
      children: Array.from({ length: cols }, (_, i) =>
        i === 0
          ? textCell('No items in this section.')
          : new TableCell({ children: [new Paragraph('')] })
      ),
    }))
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  })
}

function sectionHeader(title: string, color: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 100 },
    shading: { type: ShadingType.SOLID, color },
    children: [new TextRun({ text: `  ${title}`, bold: true, color: 'FFFFFF', size: 22, font: 'Calibri' })],
  })
}

export async function buildDocx(rows: FsnRow[], meta: ReportMeta): Promise<Buffer> {
  const today = fmtDate(new Date().toISOString())
  const relevant     = rows.filter((r) => r.filter_decision?.decision === 'relevant')
  const uncertain    = rows.filter((r) => r.filter_decision?.decision === 'uncertain')
  const excluded     = rows.filter((r) => r.filter_decision?.decision === 'excluded')
  const filterFailed = rows.filter((r) => r.filter_decision?.decision === 'filter_failed')
  const sources      = [...new Set(rows.map((r) => fmtSource(r.source_db)))]

  const children: (Paragraph | Table)[] = []

  // Header
  children.push(new Paragraph({
    children: [new TextRun({ text: 'POST-MARKET SURVEILLANCE', size: 16, color: '666666', font: 'Calibri', allCaps: true })],
  }))
  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Field Safety Notice Review Report', bold: true, size: 30, color: BRAND_NAVY, font: 'Calibri' })],
  }))

  // Metadata table
  const metaRows = [
    metaRow('Device Name', meta.device),
    metaRow('Manufacturer', meta.manufacturer),
  ]
  if (meta.device_class) metaRows.push(metaRow('Device Classification', meta.device_class))
  if (meta.emdn_code) metaRows.push(metaRow('EMDN Code', meta.emdn_code))
  metaRows.push(metaRow('Review Period', `${meta.period_from} to ${meta.period_to}`))
  metaRows.push(metaRow('Report Date', today))
  metaRows.push(metaRow('Document Reference', `PMS-FSN-${new Date().getFullYear()}-${meta.runId.slice(0, 8).toUpperCase()}`))
  metaRows.push(metaRow('Databases Searched', sources.join(', ')))
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: metaRows }))

  // Summary heading
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text: 'Summary', bold: true, size: 24, color: BRAND_NAVY, font: 'Calibri' })],
  }))

  const summaryRows = [
    metaRow('Total notices reviewed', String(rows.length)),
    metaRow('Potentially relevant', String(relevant.length)),
    metaRow('Requires further review', String(uncertain.length)),
    metaRow('Not relevant', String(excluded.length)),
  ]
  if (filterFailed.length > 0) {
    summaryRows.push(metaRow('AI filter unavailable', String(filterFailed.length)))
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }))

  // FSN sections
  if (relevant.length > 0 || uncertain.length === 0 && excluded.length === 0) {
    children.push(sectionHeader(`Potentially Relevant (${relevant.length})`, '2E7D32'))
    children.push(buildFsnTable(relevant, false))
  }

  if (uncertain.length > 0) {
    children.push(sectionHeader(`Requires Further Review (${uncertain.length})`, 'F57F17'))
    children.push(buildFsnTable(uncertain, false))
  }

  if (filterFailed.length > 0) {
    children.push(sectionHeader(`AI Filter Unavailable (${filterFailed.length})`, 'C62828'))
    children.push(buildFsnTable(filterFailed, true))
  }

  if (excluded.length > 0) {
    children.push(sectionHeader(`Not Relevant (${excluded.length})`, '6B7280'))
    children.push(buildFsnTable(excluded, true))
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20 } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1200, right: 1200 } },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Generated by Neuridion — Post-Market Surveillance Platform  |  Page ', size: 14, color: '999999', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '999999', font: 'Calibri' }),
            ],
          })],
        }),
      },
      children,
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/docx-report.ts
git commit -m "feat: add buildDocx() Word report builder

Co-Authored-By: Neuridion"
```

---

### Task 3: Database migration — add `report_docx_path`

**Files:**
- Create: `supabase/migrations/054_search_runs_docx_path.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add Word (.docx) report path to search_runs
ALTER TABLE search_runs ADD COLUMN IF NOT EXISTS report_docx_path TEXT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/054_search_runs_docx_path.sql
git commit -m "feat: add report_docx_path column to search_runs

Co-Authored-By: Neuridion"
```

---

### Task 4: Wire `buildDocx()` into report generation route

**Files:**
- Modify: `app/api/reports/route.ts`

- [ ] **Step 1: Add import at the top of the file**

Add after the existing imports (line 7):

```typescript
import { buildDocx } from '@/lib/docx-report'
```

- [ ] **Step 2: Add Word generation after Excel generation**

After the Excel buffer is built (~line 508) and before the HTML upload section (~line 514), add the Word generation block. Find the line:

```typescript
const html = buildReportHtml(profile, { period_from: run.period_from, period_to: run.period_to }, rows, run_id, termsUsed)
```

Insert BEFORE that line:

```typescript
  // ── Generate Word (.docx) — Starter+ only ───────────────────────────────────
  let docxBuf: Buffer | null = null
  const paidPlans = ['starter', 'pro', 'enterprise']
  if (paidPlans.includes(userPlan)) {
    docxBuf = await buildDocx(rows, {
      device:       profile.device_name,
      manufacturer: profile.manufacturer,
      period_from:  run.period_from,
      period_to:    run.period_to,
      emdn_code:    profile.emdn_code,
      device_class: profile.device_class,
      runId:        run_id,
    })
  }
```

- [ ] **Step 3: Add Word upload alongside HTML and Excel uploads**

Find the upload section with `htmlPath` and `excelPath` constants (~line 517-518). Add the docx path:

```typescript
  const docxPath  = docxBuf ? `${user.id}/${run_id}/${ts}_report.docx` : null
```

Then modify the `Promise.all` upload block to include the docx upload. Replace the existing `Promise.all` with:

```typescript
  const uploadPromises = [
    adminStorage.storage.from('reports').upload(htmlPath, htmlBuf, { contentType: 'text/html', upsert: true }),
    adminStorage.storage.from('reports').upload(excelPath, excelBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    }),
  ]
  if (docxBuf && docxPath) {
    uploadPromises.push(
      adminStorage.storage.from('reports').upload(docxPath, docxBuf, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      })
    )
  }
  const uploadResults = await Promise.all(uploadPromises)
  const [htmlUpload, excelUpload] = uploadResults
```

- [ ] **Step 4: Add docx signed URL generation**

After the existing signed URL generation for html and excel (~line 539-541), add:

```typescript
  const docxSigned = docxPath
    ? await adminStorage.storage.from('reports').createSignedUrl(docxPath, 60)
    : null
```

- [ ] **Step 5: Store `report_docx_path` in the search_runs update**

Find the `search_runs` update (~line 587-595) and add `report_docx_path`:

```typescript
      report_docx_path:     docxPath,
```

Add it after `report_excel_path: excelPath,`.

- [ ] **Step 6: Add `docx_url` to the JSON response**

Find the final `Response.json` (~line 599-604) and add the docx URL:

```typescript
    docx_url:   docxSigned?.data?.signedUrl ?? null,
```

Add it after `excel_url`.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "feat: wire Word (.docx) generation into report route (Starter+)

Co-Authored-By: Neuridion"
```

---

### Task 5: Update download endpoint for `format=docx`

**Files:**
- Modify: `app/api/reports/[id]/download/route.ts`

- [ ] **Step 1: Add `report_docx_path` to the select query**

Change the select on line 27-29 from:

```typescript
      report_html_path, report_pdf_path, report_excel_path,
```

to:

```typescript
      report_html_path, report_pdf_path, report_excel_path, report_docx_path,
```

- [ ] **Step 2: Add the `docx` format case**

In the format switch (~line 58-67), add a new case. Change:

```typescript
  if (format === 'excel') {
    storagePath = run.report_excel_path
    ext = 'xlsx'
  } else if (format === 'pdf') {
```

to:

```typescript
  if (format === 'excel') {
    storagePath = run.report_excel_path
    ext = 'xlsx'
  } else if (format === 'docx') {
    storagePath = (run as Record<string, unknown>).report_docx_path as string | null
    ext = 'docx'
  } else if (format === 'pdf') {
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/reports/[id]/download/route.ts
git commit -m "feat: add format=docx to report download endpoint

Co-Authored-By: Neuridion"
```

---

### Task 6: Add Word download button to archive table

**Files:**
- Modify: `app/dashboard/archive/archive-actions.tsx`
- Modify: `app/dashboard/archive/archive-table.tsx`

- [ ] **Step 1: Widen the format type in DownloadButton**

In `archive-actions.tsx`, change line 107:

```typescript
  format: 'pdf' | 'html' | 'excel'
```

to:

```typescript
  format: 'pdf' | 'html' | 'excel' | 'docx'
```

- [ ] **Step 2: Add `report_docx_path` to the archive table interface**

In `archive-table.tsx`, find the `SearchRun` interface (~line 25-27) and add after `report_excel_path`:

```typescript
  report_docx_path: string | null
```

- [ ] **Step 3: Add `hasDocx` check and download button**

In `archive-table.tsx`, find the section where `hasPdf`, `hasHtml`, `hasExcel` are set (~line 198-200). Add:

```typescript
                const hasDocx    = !!run.report_docx_path
```

Then find the Excel download button block (~line 303-305) and add after it:

```typescript
                        {hasDocx && (
                          <DownloadButton runId={run.id} format="docx" label="↓ Word" />
                        )}
```

- [ ] **Step 4: Add `report_docx_path` to the Supabase select query**

In `archive-table.tsx` or `page.tsx`, find where the `search_runs` select includes `report_html_path, report_pdf_path, report_excel_path` and add `report_docx_path` to the select string.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/archive/archive-actions.tsx app/dashboard/archive/archive-table.tsx
git commit -m "feat: add Word download button to archive table (Starter+)

Co-Authored-By: Neuridion"
```

---

### Task 7: Update plan features text and landing page

**Files:**
- Modify: `lib/plans.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update plan feature strings**

In `lib/plans.ts`, update the `features` arrays. For `starter`, `pro`, and `enterprise` plans, change `'PDF & Excel reports'` to `'PDF, Word & Excel reports'`. For `free` and `trial`, keep `'PDF & Excel reports'` (they don't get Word).

- [ ] **Step 2: Update landing page copy**

In `app/page.tsx`, find any reference to "PDF & Excel reports" or "PDF + Excel" in the pricing section and update to "PDF, Word & Excel reports" for the Starter and Pro cards. Keep "PDF & Excel reports" for the Free/Trial tier shown on the page.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/plans.ts app/page.tsx
git commit -m "feat: update plan features and landing page for Word export

Co-Authored-By: Neuridion"
```

---

### Task 8: Apply migration and final verification

- [ ] **Step 1: Apply the migration to the live Supabase database**

Apply migration `054_search_runs_docx_path.sql` via the Supabase MCP or dashboard.

- [ ] **Step 2: Run the dev server and test end-to-end**

1. Start the dev server: `npm run dev`
2. Navigate to `/dashboard/archive`
3. Pick a completed run that already has a report — generate a new report
4. Verify the response includes `docx_url` (for Starter+ accounts) or `docx_url: null` (for free)
5. Click the "↓ Word" button and verify the .docx downloads and opens in Word/LibreOffice
6. Verify the document has: cover info, summary stats, FSN tables by category, footer with page numbers

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```
