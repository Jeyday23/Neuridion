import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { extractText } from 'unpdf'
import { buildReportRows } from '@/lib/reports/effective-decisions'
import { buildReportHtml } from '@/lib/reports/html-builder'
import { buildExcel } from '@/lib/reports/excel-builder'
import { buildDocx } from '@/lib/docx-report'
import { generateReportPdf } from '@/lib/pdfshift'
import type { AdjudicationEvent, AdjudicationFilterDecision } from '@/lib/adjudication/types'

const result = { id: 'record-1', title: 'Safety notice', manufacturer: 'Maker', fsn_date: '2026-01-02', source_url: 'https://example.test/notice', source_db: 'bfarm' }
const decision: AdjudicationFilterDecision = {
  id: 'machine-2', fsn_result_id: result.id, decision: 'uncertain', rationale: 'Original machine rationale',
  confidence: 0.4, model_used: 'test-model', prompt_version: 'v1', authority_revision_id: null,
  evidence_parser_version: null, decided_at: '2026-01-03T10:00:00Z',
}
const event: AdjudicationEvent = {
  id: 'final-1', search_run_id: 'run-1', fsn_result_id: result.id, filter_decision_id: decision.id,
  reviewer_id: 'reviewer-1', phase: 'final', disposition: 'relevant', confidence: 4,
  rationale: 'Final human rationale', reviewer_role: 'prrc', qualification_attestation: 'Qualified',
  attests_qualified: true, blind_to_ai: false, provisional_event_id: null, supersedes_event_id: null,
  review_of_event_id: null, requires_second_review: false, material_change: false, serious_event_signal: false,
  ai_model_snapshot: null, ai_prompt_version_snapshot: null, authority_revision_id: null,
  evidence_parser_version_snapshot: null, created_at: '2026-01-04T10:00:00Z',
}

describe('effective report decisions', () => {
  it('uses a final human override and retains ordered automated history without mixing confidence scales', () => {
    const prior = { ...decision, id: 'machine-1', decision: 'excluded' as const, rationale: 'Earlier rationale' }
    const [row] = buildReportRows([result], [decision, prior], [event])
    expect(row.filter_decision).toEqual({ decision: 'relevant', rationale: 'Final human rationale', confidence: null })
    expect(row.human_review?.confidence).toBe(4)
    expect(row.ai_history?.map(item => item.id)).toEqual(['machine-1', 'machine-2'])
  })

  it('resolves a superseding final event independently of input order', () => {
    const next = { ...event, id: 'final-2', supersedes_event_id: event.id, disposition: 'uncertain' as const, created_at: '2026-01-05T10:00:00Z' }
    expect(buildReportRows([result], [decision], [next, event])[0].filter_decision?.decision).toBe('uncertain')
  })

  it('rejects missing, stale, provisional-only, or unconfirmed final decisions', () => {
    expect(() => buildReportRows([result], [decision], [])).toThrow()
    expect(() => buildReportRows([result], [decision], [{ ...event, filter_decision_id: 'old' }])).toThrow()
    expect(() => buildReportRows([result], [decision], [{ ...event, phase: 'provisional_blind' }])).toThrow()
    expect(() => buildReportRows([result], [decision], [{ ...event, requires_second_review: true }])).toThrow()
    expect(() => buildReportRows([result], [], [])).toThrow()
  })

  it('allows an unsampled deterministic exclusion and labels its origin', () => {
    const [row] = buildReportRows([result], [{ ...decision, decision: 'excluded' }], [])
    expect(row.decision_origin).toBe('automated')
    expect(row.filter_decision?.decision).toBe('excluded')
  })

  it('retains final disposition, AI history, failed source, and warnings in every generated format', async () => {
    const rows = buildReportRows([result], [decision], [event])
    const coverage = {
      status: 'degraded', dbs_searched: ['bfarm', 'mhra'], error_message: 'MHRA retrieval unavailable',
      timing: { source_breakdown: [{ source: 'bfarm', status: 'complete' }, { source: 'mhra', status: 'failed' }] },
    }
    const profile = { device_name: 'Device', manufacturer: 'Maker', device_class: null, emdn_code: null }
    const run = { period_from: '2026-01-01', period_to: '2026-01-31', ...coverage }
    const meta = { device: profile.device_name, manufacturer: profile.manufacturer, ...run, runId: 'run-1' }
    const html = buildReportHtml(profile, run, rows, 'run-1', null)
    const workbook = new ExcelJS.Workbook()
    const excel = await buildExcel(rows, meta, null)
    await workbook.xlsx.load(excel as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const xlsxText = JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()))
    const zip = await JSZip.loadAsync(await buildDocx(rows, meta))
    const docxText = await zip.file('word/document.xml')!.async('string')
    const pdf = await generateReportPdf({ profile, run, rows, runId: 'run-1' })
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true })
    for (const content of [html, xlsxText, docxText, text]) {
      expect(content).toContain('Final human rationale')
      expect(content).toContain('Original machine rationale')
      expect(content).toContain('mhra: failed')
      expect(content).toContain('MHRA retrieval unavailable')
      expect(content).toContain('Run status: degraded')
      expect(content).not.toContain('400%')
      expect(content).not.toContain('All published FSNs')
    }
  }, 20_000)
})
