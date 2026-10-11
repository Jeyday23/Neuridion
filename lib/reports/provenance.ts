import { createHash } from 'crypto'
import type { FsnReportRow } from '@/lib/domain/types'
import type { InputCurrencySummary } from '@/lib/sources/input-currency'

/**
 * One provenance model for every report format. Each builder renders the same
 * lines (via coverageLines), so PDF, Word, Excel and HTML cannot disagree on
 * who reviewed, who approved, which versions produced the screening, whether
 * inputs were superseded, or how the run compares with the previous cycle.
 *
 * Bump REPORT_FORMAT_VERSION whenever report content semantics change. Stored
 * artifacts from older versions are refused at download and must be
 * regenerated (lib/reports/review-gate.ts).
 */
export const REPORT_FORMAT_VERSION = 'v3'

export interface ReportPerson {
  name: string | null
  id: string | null
  at: string | null
}

export interface ReportCycleSummary {
  previous_run_id: string | null
  comparable: boolean
  reasons: string[]
  explanations: string[]
}

export interface ReportProvenance {
  format_version: string
  generated_at: string
  document_reference: string
  reviewed: ReportPerson
  approved: ReportPerson
  ai_models: string[]
  prompt_versions: string[]
  ruleset_versions: string[]
  record_digest: string
  input_currency: { summary: InputCurrencySummary | null; warnings: string[] }
  cycle: ReportCycleSummary | null
}

/** Stable reference tied to the run, not to the day the file was produced. */
export function documentReference(runId: string, runDate: string | null | undefined): string {
  const parsed = runDate ? new Date(runDate) : null
  const year = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getUTCFullYear() : 'UNDATED'
  return `PMS-FSN-${year}-${runId.slice(0, 8).toUpperCase()}`
}

/**
 * sha256 over the decision-bearing content of the report rows, independent of
 * row order. Two reports with the same digest present the same records with
 * the same final dispositions and decision basis.
 */
export function reportRecordDigest(rows: FsnReportRow[]): string {
  const canonical = rows
    .map(row => ({
      id: row.id,
      source_db: row.source_db,
      source_url: row.source_url,
      decision: row.filter_decision?.decision ?? null,
      origin: row.decision_origin ?? null,
      human_event: row.human_review?.event_id ?? null,
      ai: (row.ai_history ?? []).map(item => item.id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function utc(iso: string | null): string {
  if (!iso) return 'not recorded'
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? 'not recorded' : `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function person(label: string, value: ReportPerson): string {
  if (!value.id) return `${label}: not recorded`
  return `${label}: ${value.name ?? 'name unavailable'} (user ${value.id}) at ${utc(value.at)}`
}

export function provenanceLines(p: ReportProvenance): string[] {
  const lines = [
    `Report format: ${p.format_version}; generated ${utc(p.generated_at)}; reference ${p.document_reference}`,
    person('Reviewed by', p.reviewed),
    person('Approved by', p.approved),
    ...(p.reviewed.id && p.approved.id && p.reviewed.id === p.approved.id
      ? ['Independence: the same person reviewed and approved this search.']
      : []),
    `Automated assessment models: ${p.ai_models.join(', ') || 'none recorded'}`,
    `Prompt versions as recorded: ${p.prompt_versions.join(', ') || 'not recorded'}`,
    `Ruleset versions as recorded: ${p.ruleset_versions.join(', ') || 'not recorded'}`,
    `Record digest (sha256 over records and final dispositions): ${p.record_digest}`,
  ]

  const summary = p.input_currency.summary
  if (summary) {
    lines.push(
      `Input currency at generation: ${summary.current} of ${summary.total} screened records match the current stored version; ` +
      `${summary.changed} changed since screening; ${summary.unknown} not verifiable.`,
    )
  }
  lines.push(...p.input_currency.warnings.map(w => `Input currency warning: ${w}`))

  if (p.cycle) {
    if (!p.cycle.previous_run_id) {
      lines.push('Previous cycle: no earlier comparable search for this device profile.')
    } else {
      lines.push(`Previous cycle: compared with search ${p.cycle.previous_run_id}${p.cycle.comparable ? '' : ' (not a like-for-like comparison)'}.`)
      lines.push(...p.cycle.reasons.map(reason => `Previous cycle limitation: ${reason}`))
      lines.push(...p.cycle.explanations.map(text => `Previous cycle: ${text}`))
    }
  }
  return lines
}
