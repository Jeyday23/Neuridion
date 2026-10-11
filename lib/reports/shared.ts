import { provenanceLines, documentReference, type ReportProvenance } from './provenance'

export const DECISION_LABEL: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Further Review',
  excluded:      'Not Relevant',
  filter_failed: 'Unprocessed — Manual Review Required',
}

export interface ReportCoverage {
  status?: string
  dbs_searched?: string[] | null
  error_message?: string | null
  timing?: unknown
  /** Shared provenance; rendered identically in every format. */
  provenance?: ReportProvenance
}

export const ASSESSMENT_NOTE = 'Final human dispositions take precedence where recorded. Automated assessments remain separately identified for traceability and are not regulatory decisions.'

export function coverageLines(run: ReportCoverage): string[] {
  const timing = run.timing as { source_breakdown?: { source: string; status: string; requested_from?: string; requested_to?: string }[] } | null
  const breakdown = Array.isArray(timing?.source_breakdown) ? timing.source_breakdown : []
  const selected = run.dbs_searched ?? []
  return [
    `Run status: ${run.status ?? 'not recorded'}`,
    `Selected sources: ${selected.join(', ') || 'not recorded'}`,
    ...selected.map((source) => {
      const result = breakdown.find((item) => item.source === source)
      return `${source}: ${result?.status ?? 'coverage not recorded'}${result?.requested_from && result?.requested_to ? ` (${result.requested_from} to ${result.requested_to})` : ''}`
    }),
    ...(run.status === 'degraded' ? ['Partial results: retrieval or assessment was incomplete. Review the source outcomes and warnings before relying on this report.'] : []),
    ...(run.error_message ? [`Warnings: ${run.error_message}`] : []),
    'Coverage describes this search only; it does not establish that every published notice was retrieved.',
    ...(run.provenance ? provenanceLines(run.provenance) : []),
  ]
}

/** Run-anchored reference; falls back to the generation year only for legacy callers. */
export function reportReference(runId: string, coverage: ReportCoverage): string {
  return coverage.provenance?.document_reference ?? documentReference(runId, new Date().toISOString())
}

export function assessmentHistoryLines(row: import('@/lib/domain/types').FsnReportRow): string[] {
  return [
    `Record: ${row.title} (${row.id})`,
    `Source: ${row.source_db}${row.source_url ? ` ${row.source_url}` : ''}`,
    row.human_review
      ? `Final human disposition: ${row.filter_decision?.decision}; reviewer ${row.human_review.reviewer_name ? `${row.human_review.reviewer_name} (user ${row.human_review.reviewer_id})` : row.human_review.reviewer_id}; ${row.human_review.reviewed_at}; event ${row.human_review.event_id}; human confidence ${row.human_review.confidence ?? 'not recorded'} (1-5 scale). Rationale: ${row.filter_decision?.rationale}`
      : 'Disposition basis: automated assessment; no final human disposition recorded.',
    ...(row.ai_history ?? []).map((item) => `Automated assessment ${item.id} (${item.decided_at}; ${item.model_used ?? 'deterministic rule'}): ${item.decision}. Rationale: ${item.rationale}`),
  ]
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function safeCell(val: string | null | undefined): string {
  if (!val) return ''
  const stripped = val.replace(/^[﻿​ ]+/, '')
  if (/^[=+\-@\t\r|]/.test(stripped)) return "'" + stripped
  return stripped
}

export function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}
