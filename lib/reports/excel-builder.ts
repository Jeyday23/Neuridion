import ExcelJS from 'exceljs'
import { DECISION_LABEL, fmtDate, safeCell } from './shared'
import type { FsnReportRow } from '@/lib/domain/types'

export async function buildExcel(
  rows: FsnReportRow[],
  meta: { device: string; manufacturer: string; period_from: string; period_to: string },
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Neuridion'
  wb.created = new Date()

  // Group by source database — currently only BfArM; extend when more sources added
  const sources = [...new Set(rows.map((r) => r.source_db))]
  if (sources.length === 0) sources.push('bfarm')

  for (const src of sources) {
    const sheetName = src === 'bfarm' ? 'BfArM' : src === 'maude' ? 'FDA MAUDE' : src === 'mhra' ? 'MHRA' : src.toUpperCase()
    const ws = wb.addWorksheet(sheetName)

    // Columns
    ws.columns = [
      { header: 'Title',       key: 'title',       width: 55 },
      { header: 'Manufacturer', key: 'manufacturer', width: 30 },
      { header: 'Date',        key: 'fsn_date',     width: 14 },
      { header: 'Source URL',  key: 'source_url',   width: 45 },
      { header: 'Assessment',  key: 'assessment',   width: 26 },
      { header: 'Notes',       key: 'notes',        width: 55 },
      { header: 'Confidence',  key: 'confidence',   width: 14 },
    ]

    // Bold, shaded header row
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } }
    headerRow.alignment = { vertical: 'middle' }
    headerRow.height = 18

    // Data rows — relevant/uncertain first, filter_failed next, excluded last
    const sorted = [
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'relevant'),
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'uncertain'),
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'filter_failed'),
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'excluded'),
      ...rows.filter((r) => r.source_db === src && !r.filter_decision),
    ]

    for (const row of sorted) {
      const d = row.filter_decision
      const dataRow = ws.addRow({
        title:        safeCell(row.title),
        manufacturer: safeCell(row.manufacturer) || '—',
        fsn_date:     row.fsn_date ? fmtDate(row.fsn_date) : '—',
        source_url:   safeCell(row.source_url),
        assessment:   d ? DECISION_LABEL[d.decision] : '—',
        notes:        safeCell(d?.rationale),
        confidence:   (d && d.confidence != null) ? `${Math.round(d.confidence * 100)}%` : '—',
      })

      // Row colour by assessment
      const bg = !d ? undefined
        : d.decision === 'relevant'      ? 'FF92D050'  // green
        : d.decision === 'uncertain'     ? 'FFFFCC00'  // yellow
        : d.decision === 'filter_failed' ? 'FFFF9999'  // light red
        : 'FFD3D3D3'                                    // grey

      if (bg) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        })
      }

      // Wrap long cells
      dataRow.getCell('title').alignment = { wrapText: true, vertical: 'top' }
      dataRow.getCell('notes').alignment = { wrapText: true, vertical: 'top' }
    }

    // Freeze header
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  // Summary sheet — created once after all source sheets
  const sumWs = wb.addWorksheet('Summary')
  sumWs.columns = [{ width: 30 }, { width: 40 }]
  const addMeta = (label: string, value: string) => {
    const r = sumWs.addRow([label, value])
    r.getCell(1).font = { bold: true }
  }
  sumWs.addRow(['POST-MARKET SURVEILLANCE', 'Field Safety Notice Review']).font = { bold: true, size: 13 }
  sumWs.addRow([])
  addMeta('Device', meta.device)
  addMeta('Manufacturer', meta.manufacturer)
  addMeta('Review period', `${meta.period_from} to ${meta.period_to}`)
  addMeta('Report generated', fmtDate(new Date().toISOString()))
  sumWs.addRow([])
  addMeta('Total notices reviewed', String(rows.length))
  addMeta('Potentially relevant', String(rows.filter((r) => r.filter_decision?.decision === 'relevant').length))
  addMeta('Requires further review', String(rows.filter((r) => r.filter_decision?.decision === 'uncertain').length))
  addMeta('Not relevant', String(rows.filter((r) => r.filter_decision?.decision === 'excluded').length))
  const failedCount = rows.filter((r) => r.filter_decision?.decision === 'filter_failed').length
  if (failedCount > 0) {
    addMeta('AI filter unavailable (manual review required)', String(failedCount))
  }

  if (termsUsed) {
    sumWs.addRow([])
    addMeta('Manufacturer Search Terms', termsUsed.manufacturer_terms.join(', ') || '(none)')
    addMeta('Device Search Terms', termsUsed.device_terms.join(', ') || '(none)')
    addMeta('Source Manufacturer Name', termsUsed.raw_manufacturer || '—')
    addMeta('Source Device Name', termsUsed.raw_device_name || '—')
    addMeta('Term Algorithm Version', termsUsed.term_algorithm_version)
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
