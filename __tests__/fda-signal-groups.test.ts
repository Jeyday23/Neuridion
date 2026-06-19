import { describe, expect, it } from 'vitest'
import { extractFdaFailureMode, groupFdaSignals } from '@/lib/signals/fda-signal-groups'
import { buildReportHtml } from '@/lib/reports/html-builder'
import { buildExcel } from '@/lib/reports/excel-builder'
import ExcelJS from 'exceljs'
import type { FsnReportRow } from '@/lib/domain/types'

const fdaRows: FsnReportRow[] = [
  {
    id: 'report-1', source_db: 'fda', title: 'INFUSOMAT — Malfunction', manufacturer: 'B. Braun',
    product_name: 'INFUSOMAT', raw_content: 'Product problems: Failure to Deliver',
    fsn_date: '2026-01-10', source_url: 'https://api.fda.gov/report/1', filter_decision: null,
  },
  {
    id: 'report-2', source_db: 'fda', title: 'INFUSOMAT — Malfunction', manufacturer: 'B Braun',
    product_name: 'INFUSOMAT', raw_content: 'Product problems: Failure to Deliver',
    fsn_date: '2026-03-12', source_url: 'https://api.fda.gov/report/2', filter_decision: null,
  },
]

describe('FDA signal grouping', () => {
  it('normalizes problem order while retaining every report as evidence', () => {
    const groups = groupFdaSignals([
      {
        source_db: 'fda', title: 'INFUSOMAT — Malfunction', manufacturer: 'B. Braun', product_name: 'INFUSOMAT',
        raw_content: 'Event type: Malfunction\nProduct problems: Pumping Stopped, Failure to Deliver',
        fsn_date: '2026-01-10', source_url: 'https://api.fda.gov/report/1',
      },
      {
        source_db: 'fda', title: 'INFUSOMAT — Injury', manufacturer: 'B Braun', product_name: 'INFUSOMAT',
        raw_content: 'Event type: Injury\nProduct problems: Failure to Deliver, Pumping Stopped',
        fsn_date: '2026-03-12', source_url: 'https://api.fda.gov/report/2',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      reportCount: 2,
      firstReported: '2026-01-10',
      lastReported: '2026-03-12',
      failureMode: 'Failure to Deliver, Pumping Stopped',
    })
    expect(groups[0].evidenceUrls).toHaveLength(2)
  })

  it('keeps different failure modes separate and ignores non-FDA records', () => {
    const groups = groupFdaSignals([
      { source_db: 'fda', title: 'Micra — Malfunction', manufacturer: 'Medtronic', raw_content: 'Product problems: Battery Problem', fsn_date: null, source_url: null },
      { source_db: 'fda', title: 'Micra — Malfunction', manufacturer: 'Medtronic', raw_content: 'Product problems: Failure to Capture', fsn_date: null, source_url: null },
      { source_db: 'bfarm', title: 'Micra notice', manufacturer: 'Medtronic', raw_content: 'Product problems: Battery Problem', fsn_date: null, source_url: null },
    ])

    expect(groups.map(group => group.failureMode)).toEqual(['Battery Problem', 'Failure to Capture'])
  })

  it('falls back to event type when product problems are absent', () => {
    expect(extractFdaFailureMode('Event type: Injury\nNarrative')).toBe('Event type: Injury')
  })

  it('includes the grouped signal and regulatory qualification in HTML reports', () => {
    const html = buildReportHtml(
      { device_name: 'Infusomat', manufacturer: 'B. Braun', device_class: null, emdn_code: null },
      { period_from: '2026-01-01', period_to: '2026-12-31' },
      fdaRows,
      '12345678-test',
      null,
    )

    expect(html).toContain('FDA MAUDE Signal Summary')
    expect(html).toContain('not a confirmed hazard, recall, or Field Safety Notice')
    expect(html).toContain('>2</td>')
  })

  it('keeps raw FDA reports and adds a signal summary worksheet', async () => {
    const buffer = await buildExcel(fdaRows, {
      device: 'Infusomat', manufacturer: 'B. Braun', period_from: '2026-01-01', period_to: '2026-12-31',
    }, null)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.getWorksheet('FDA MAUDE')?.rowCount).toBe(3)
    expect(workbook.getWorksheet('FDA Signal Summary')?.getRow(2).getCell(4).value).toBe(2)
  })
})
