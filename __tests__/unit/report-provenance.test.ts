import { describe, expect, it } from 'vitest'
import { documentReference, provenanceLines, reportRecordDigest, REPORT_FORMAT_VERSION, type ReportProvenance } from '@/lib/reports/provenance'
import { isCurrentReportArtifact } from '@/lib/reports/review-gate'
import type { FsnReportRow } from '@/lib/domain/types'

const row = (id: string, decision: 'relevant' | 'excluded'): FsnReportRow => ({
  id, title: 't', manufacturer: 'm', fsn_date: null, source_url: 'https://x', source_db: 'mhra',
  filter_decision: { decision, rationale: 'r', confidence: null }, decision_origin: 'human',
})

const base: ReportProvenance = {
  format_version: REPORT_FORMAT_VERSION, generated_at: '2026-10-10T12:00:00Z', document_reference: 'REF',
  reviewed: { id: 'a', name: 'A', at: '2026-10-09T08:00:00Z' }, approved: { id: 'a', name: 'A', at: '2026-10-09T09:00:00Z' },
  ai_models: [], prompt_versions: [], ruleset_versions: [], record_digest: 'd',
  input_currency: { summary: null, warnings: [] }, cycle: null,
}

describe('report provenance', () => {
  it('anchors the document reference to the run date, not the generation date', () => {
    expect(documentReference('abcdef1234', '2024-03-01T00:00:00Z')).toBe('PMS-FSN-2024-ABCDEF12')
    expect(documentReference('abcdef1234', null)).toBe('PMS-FSN-UNDATED-ABCDEF12')
  })

  it('digest is order independent and changes with a disposition', () => {
    const d1 = reportRecordDigest([row('1', 'relevant'), row('2', 'excluded')])
    expect(reportRecordDigest([row('2', 'excluded'), row('1', 'relevant')])).toBe(d1)
    expect(reportRecordDigest([row('1', 'excluded'), row('2', 'excluded')])).not.toBe(d1)
  })

  it('states same-person review and approval and missing attribution plainly', () => {
    expect(provenanceLines(base).join('\n')).toContain('the same person reviewed and approved')
    const none = provenanceLines({ ...base, reviewed: { id: null, name: null, at: null }, approved: { id: null, name: null, at: null } })
    expect(none).toContain('Reviewed by: not recorded')
    expect(none).toContain('Approved by: not recorded')
  })

  it('says when there is no previous cycle', () => {
    const lines = provenanceLines({ ...base, cycle: { previous_run_id: null, comparable: false, reasons: [], explanations: [] } })
    expect(lines.join('\n')).toContain('no earlier comparable search')
  })

  it('refuses artifacts produced by older report formats', () => {
    expect(isCurrentReportArtifact('u/r/1700000000000_v3_report.pdf')).toBe(true)
    expect(isCurrentReportArtifact('u/r/1700000000000_v2_report.pdf')).toBe(false)
    expect(isCurrentReportArtifact('u/r/report.pdf')).toBe(false)
  })
})
