import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, WidthType, BorderStyle,
  HeadingLevel, Footer, PageNumber,
  ShadingType, TableLayoutType,
} from 'docx'
import { fmtSourceDb } from '@/lib/domain/source-labels'
import type { FsnReportRow } from '@/lib/domain/types'

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
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

function textCell(text: string, size = 18, bgColor?: string): TableCell {
  return new TableCell({
    ...(bgColor ? { shading: { type: ShadingType.SOLID, color: bgColor } } : {}),
    children: [new Paragraph({
      children: [new TextRun({ text: text || '—', size, font: 'Calibri' })],
    })],
  })
}

function buildFsnTable(items: FsnReportRow[], compact: boolean): Table {
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
      ? [textCell(r.title, 18, bg), textCell(r.manufacturer || '—', 18, bg), textCell(fmtDate(r.fsn_date), 18, bg), textCell(displayRationale, 16, bg)]
      : [textCell(r.title, 18, bg), textCell(r.manufacturer || '—', 18, bg), textCell(fmtDate(r.fsn_date), 18, bg), textCell(fmtSourceDb(r.source_db), 18, bg), textCell(displayRationale, 16, bg), textCell(confidence, 18, bg)]

    return new TableRow({
      children: cells,
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

export async function buildDocx(rows: FsnReportRow[], meta: ReportMeta): Promise<Buffer> {
  const today = fmtDate(new Date().toISOString())
  const relevant     = rows.filter((r) => r.filter_decision?.decision === 'relevant')
  const uncertain    = rows.filter((r) => r.filter_decision?.decision === 'uncertain')
  const excluded     = rows.filter((r) => r.filter_decision?.decision === 'excluded')
  const filterFailed = rows.filter((r) => r.filter_decision?.decision === 'filter_failed')
  const sources      = [...new Set(rows.map((r) => fmtSourceDb(r.source_db)))]

  const children: (Paragraph | Table)[] = []

  // AI Disclaimer
  children.push(new Paragraph({
    spacing: { after: 200 },
    shading: { type: ShadingType.SOLID, color: 'FEF2F2' },
    children: [
      new TextRun({ text: 'AI Disclaimer: ', bold: true, size: 18, font: 'Calibri', color: '991B1B' }),
      new TextRun({
        text: 'This report was generated with AI-assisted relevance filtering. All classifications (relevant, uncertain, excluded) are automated assessments and must be independently verified by the PRRC before use in regulatory submissions. The AI model may produce incorrect classifications.',
        size: 18,
        font: 'Calibri',
        color: '991B1B',
      }),
    ],
  }))

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

  // Conclusion
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text: 'Conclusion', bold: true, size: 24, color: BRAND_NAVY, font: 'Calibri' })],
  }))

  const conclusionRelevant = relevant.length + uncertain.length
  const failedNote = filterFailed.length > 0
    ? ` Note: The AI filter could not be applied to ${filterFailed.length} item${filterFailed.length !== 1 ? 's' : ''} due to API unavailability — these require manual review.`
    : ''
  const conclusionText = conclusionRelevant === 0 && filterFailed.length === 0
    ? 'Based on the automated screening, no Field Safety Notices were classified as relevant to this device profile during the search period. This automated assessment should be reviewed and confirmed by the Person Responsible for Regulatory Compliance (PRRC) before being included in post-market surveillance documentation.'
    : `This review identified ${conclusionRelevant + filterFailed.length} Field Safety Notice${(conclusionRelevant + filterFailed.length) !== 1 ? 's' : ''} requiring attention (${relevant.length} potentially relevant, ${uncertain.length} requiring further review${filterFailed.length > 0 ? `, ${filterFailed.length} AI filter unavailable` : ''}). ${excluded.length > 0 ? `${excluded.length} notice${excluded.length !== 1 ? 's were' : ' was'} assessed as not relevant and excluded from further review. ` : ''}Appropriate follow-up actions should be taken in accordance with the applicable post-market surveillance plan. This automated assessment should be reviewed and confirmed by the Person Responsible for Regulatory Compliance (PRRC) before being included in post-market surveillance documentation.${failedNote}`

  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: conclusionText, italics: true, size: 20, font: 'Calibri', color: '333333' })],
  }))

  // Signature block
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text: 'Review & Approval', bold: true, size: 24, color: BRAND_NAVY, font: 'Calibri' })],
  }))

  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: 'Reviewed by: _______________', size: 20, font: 'Calibri' })],
  }))
  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: 'Date: _______________', size: 20, font: 'Calibri' })],
  }))
  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: 'Signature: _______________', size: 20, font: 'Calibri' })],
  }))
  children.push(new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [
      new TextRun({ text: 'PRRC Confirmation: ', bold: true, size: 20, font: 'Calibri' }),
      new TextRun({
        text: '[ ] I have reviewed this report and confirm the AI-assisted classifications are appropriate for inclusion in post-market surveillance documentation.',
        size: 20,
        font: 'Calibri',
      }),
    ],
  }))

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
