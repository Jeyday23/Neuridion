'use client'

import { useId, useState } from 'react'
import { clsx } from 'clsx'
import { apiFetch } from '@/lib/fetch'

export type HumanDisposition = 'relevant' | 'uncertain' | 'excluded'
export type ReviewerRole = 'prrc' | 'regulatory_affairs' | 'quality_assurance' | 'clinical' | 'other'
export type AdjudicationPhase = 'provisional_blind' | 'final' | 'second_review'

export interface ReleasedFilterDecision {
  id: string
  decision: HumanDisposition | 'filter_failed'
  rationale: string
  confidence: number | null
  model_used: string | null
  prompt_version: string | null
  decided_at: string | null
}

export interface AdjudicationEvent {
  id: string
  phase: AdjudicationPhase
  disposition: HumanDisposition
  confidence: number | null
  rationale: string
  reviewer_id: string
  reviewer_role: ReviewerRole
  qualification_attestation: string
  blind_to_ai: boolean
  requires_second_review: boolean
  material_change: boolean
  serious_event_signal: boolean
  created_at: string
}

export interface AdjudicationRecord {
  fsn_result: {
    id: string
    title: string
    manufacturer: string | null
    fsn_date: string | null
    source_url: string | null
    source_db: string
  }
  review_required: boolean
  requirement_reasons: string[]
  blind_review_required: boolean
  ai_revealed: boolean
  /** Omitted entirely while a blind-required record remains unrevealed to this viewer. */
  filter_decision?: ReleasedFilterDecision | null
  provisional_blind: AdjudicationEvent | null
  final: AdjudicationEvent | null
  second_review: AdjudicationEvent | null
  complete: boolean
}

export interface AdjudicationPermissions {
  is_owner: boolean
  assignment_role: 'primary' | 'secondary' | 'both' | null
  can_primary_review: boolean
  can_second_review: boolean
}

export interface AdjudicationSummary {
  total_records: number
  required_records: number
  completed_records: number
  pending_records: number
  second_review_pending: number
  ready_for_approval: boolean
}

export interface AdjudicationsResponse {
  run_id: string
  review_status: string
  permissions: AdjudicationPermissions
  summary: AdjudicationSummary
  records: AdjudicationRecord[]
}

export interface ReviewerCredentials {
  role: ReviewerRole | ''
  qualificationAttestation: string
  attestsQualified: boolean
}

export type AdjudicationStage =
  | 'not_required'
  | 'provisional_blind'
  | 'final'
  | 'second_review'
  | 'resolution_required'
  | 'complete'

export function adjudicationStage(record: AdjudicationRecord): AdjudicationStage {
  if (!record.review_required) return 'not_required'
  if (record.complete) return 'complete'
  // A secondary-only reviewer may be allowed to see a revealed record without
  // owning the primary reviewer's provisional event. `ai_revealed` is the
  // server-authoritative disclosure state for this viewer; do not send that
  // reviewer back through a provisional form they are not permitted to submit.
  if (record.blind_review_required && !record.provisional_blind && !record.ai_revealed) return 'provisional_blind'
  if (!record.final) return 'final'
  if (record.final.requires_second_review && !record.second_review) return 'second_review'
  if (record.second_review && record.second_review.disposition !== record.final.disposition) {
    return 'resolution_required'
  }
  return 'complete'
}

export function isMaterialDowngrade(
  record: AdjudicationRecord,
  disposition: HumanDisposition | '',
): boolean {
  if (disposition !== 'excluded') return false
  return record.provisional_blind?.disposition === 'relevant'
    || record.filter_decision?.decision === 'relevant'
    || record.filter_decision?.decision === 'uncertain'
}

export function reviewerCredentialsReady(credentials: ReviewerCredentials): boolean {
  return credentials.role !== ''
    && credentials.qualificationAttestation.trim().length >= 10
    && credentials.attestsQualified
}

function formatRole(role: ReviewerRole): string {
  const labels: Record<ReviewerRole, string> = {
    prrc: 'PRRC',
    regulatory_affairs: 'Regulatory affairs',
    quality_assurance: 'Quality assurance',
    clinical: 'Clinical',
    other: 'Other qualified reviewer',
  }
  return labels[role]
}

function formatRequirement(reason: string): string {
  const labels: Record<string, string> = {
    relevant: 'AI classified relevant',
    uncertain: 'AI classified uncertain',
    filter_failed: 'AI assessment unavailable',
    ai_relevant: 'AI classified relevant',
    ai_uncertain: 'AI classified uncertain',
    ai_filter_failed: 'AI assessment unavailable',
    blind_validation: 'Selected for blind validation',
    blind_validation_sample: 'Selected for blind validation',
    serious_event_signal: 'Potential serious-event signal',
  }
  return labels[reason] ?? reason.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const DISPOSITION_STYLES: Record<HumanDisposition, string> = {
  relevant: 'border-green-200 bg-green-50 text-green-800',
  uncertain: 'border-amber-200 bg-amber-50 text-amber-800',
  excluded: 'border-zinc-200 bg-zinc-100 text-zinc-700',
}

function DispositionBadge({ disposition, prefix }: { disposition: HumanDisposition; prefix?: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${DISPOSITION_STYLES[disposition]}`}>
      {prefix}{disposition[0].toUpperCase()}{disposition.slice(1)}
    </span>
  )
}

export function ReviewerQualification({
  value,
  onChange,
}: {
  value: ReviewerCredentials
  onChange: (value: ReviewerCredentials) => void
}) {
  const attestationHelpId = useId()

  return (
    <fieldset className="rounded-md border border-zinc-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-zinc-900">Reviewer qualification for this session</legend>
      <p className="mb-3 text-xs leading-relaxed text-zinc-600">
        Each submitted disposition stores this role and qualification statement as an immutable snapshot.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-700">
          Reviewer role
          <select
            value={value.role}
            onChange={event => onChange({ ...value, role: event.target.value as ReviewerCredentials['role'] })}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-teal-100"
          >
            <option value="">Select a role</option>
            <option value="prrc">PRRC</option>
            <option value="regulatory_affairs">Regulatory affairs</option>
            <option value="quality_assurance">Quality assurance</option>
            <option value="clinical">Clinical</option>
            <option value="other">Other qualified reviewer</option>
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-700">
          Qualification statement
          <input
            value={value.qualificationAttestation}
            onChange={event => onChange({ ...value, qualificationAttestation: event.target.value })}
            aria-describedby={attestationHelpId}
            placeholder="For example: appointed PRRC for this device family"
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
          <span id={attestationHelpId} className="mt-1 block font-normal text-zinc-500">
            Describe the basis for your authority and competence; do not enter certificate numbers or sensitive data.
          </span>
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          checked={value.attestsQualified}
          onChange={event => onChange({ ...value, attestsQualified: event.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#0D9488] focus:ring-[#0D9488]"
        />
        <span>I attest that I am authorised and qualified under the organisation&apos;s procedure to make this review.</span>
      </label>
      {!reviewerCredentialsReady(value) && (
        <p className="mt-2 text-xs text-amber-700" role="status">
          Select a role, enter at least 10 characters describing your qualification, and confirm the attestation before submitting a disposition.
        </p>
      )}
    </fieldset>
  )
}

function ExistingEvent({ label, event }: { label: string; event: AdjudicationEvent }) {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-800">{label}</span>
        <DispositionBadge disposition={event.disposition} />
        {event.confidence != null && <span>Confidence {event.confidence}/5</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{event.rationale}</p>
      <p className="mt-1 text-zinc-500">{formatRole(event.reviewer_role)} · {dateTime(event.created_at)}</p>
      <p className="mt-1 text-zinc-500">Qualification: {event.qualification_attestation}</p>
      {event.requires_second_review && (
        <p className="mt-1 font-medium text-amber-800">Independent second review required</p>
      )}
    </div>
  )
}

function AiAssessment({ record }: { record: AdjudicationRecord }) {
  const decision = record.filter_decision
  if (!record.ai_revealed || !decision) return null

  return (
    <div className="rounded border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-zinc-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-blue-900">AI assessment</span>
        {decision.decision === 'filter_failed' ? (
          <span className="inline-flex rounded border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700">Unprocessed</span>
        ) : (
          <DispositionBadge disposition={decision.decision} />
        )}
        {decision.confidence != null && <span>{Math.round(decision.confidence * 100)}% confidence</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{decision.rationale}</p>
      {record.blind_review_required && record.provisional_blind && (
        <p className="mt-1 font-medium text-blue-800">Revealed only after the provisional blind decision was locked.</p>
      )}
    </div>
  )
}

function DispositionForm({
  record,
  runId,
  stage,
  credentials,
  permissions,
  onSaved,
}: {
  record: AdjudicationRecord
  runId: string
  stage: 'provisional_blind' | 'final' | 'second_review' | 'resolution_required'
  credentials: ReviewerCredentials
  permissions: AdjudicationPermissions
  onSaved: () => Promise<void>
}) {
  const formId = useId()
  const [disposition, setDisposition] = useState<HumanDisposition | ''>('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phase: AdjudicationPhase = stage === 'resolution_required' ? 'final' : stage
  const isProvisional = phase === 'provisional_blind'
  const isSecondReview = phase === 'second_review'
  const canSubmitPhase = isSecondReview ? permissions.can_second_review : permissions.can_primary_review
  const downgrade = isMaterialDowngrade(record, disposition)
  const rationaleMinimum = downgrade ? 20 : 10
  const valid = disposition !== ''
    && (!isProvisional || confidence !== null)
    && rationale.trim().length >= rationaleMinimum
    && reviewerCredentialsReady(credentials)
    && canSubmitPhase

  const title = isProvisional
    ? 'Independent provisional disposition'
    : isSecondReview
      ? 'Independent second review'
      : stage === 'resolution_required'
        ? 'Resolve reviewer disagreement'
        : 'Final regulatory disposition'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || credentials.role === '') return
    setSubmitting(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/search-runs/${runId}/adjudications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fsn_result_id: record.fsn_result.id,
          phase,
          disposition,
          ...(isProvisional ? { confidence } : {}),
          rationale: rationale.trim(),
          reviewer_role: credentials.role,
          qualification_attestation: credentials.qualificationAttestation.trim(),
          attests_qualified: true,
          ...(stage === 'resolution_required' && record.final ? { supersedes_event_id: record.final.id } : {}),
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'The disposition could not be saved.')
      }
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The disposition could not be saved.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className={clsx(
      'rounded-md border p-3',
      isProvisional ? 'border-violet-200 bg-violet-50/50' :
      isSecondReview || stage === 'resolution_required' ? 'border-amber-200 bg-amber-50/50' :
      'border-teal-200 bg-teal-50/40',
    )}>
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900">{title}</legend>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">
          {isProvisional && 'The AI classification is concealed. Submit your independent assessment to lock it and reveal the AI result.'}
          {phase === 'final' && stage !== 'resolution_required' && 'This becomes the regulatory disposition used by the run and its controlled outputs.'}
          {isSecondReview && 'A different qualified reviewer must independently confirm or challenge the final disposition.'}
          {stage === 'resolution_required' && 'The second reviewer disagreed. The primary reviewer must append a superseding final decision with a written resolution.'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(['relevant', 'uncertain', 'excluded'] as HumanDisposition[]).map(option => {
            const inputId = `${formId}-${option}`
            return (
              <label key={option} htmlFor={inputId} className={clsx(
                'flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs font-medium transition-colors',
                disposition === option ? DISPOSITION_STYLES[option] : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300',
              )}>
                <input
                  id={inputId}
                  name={`${formId}-disposition`}
                  type="radio"
                  value={option}
                  checked={disposition === option}
                  onChange={() => setDisposition(option)}
                  className="h-4 w-4 border-zinc-300 text-[#0D9488] focus:ring-[#0D9488]"
                />
                {option[0].toUpperCase()}{option.slice(1)}
              </label>
            )
          })}
        </div>
      </fieldset>

      {isProvisional && (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-zinc-700">Confidence in your independent assessment</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(value => {
              const inputId = `${formId}-confidence-${value}`
              return (
                <label key={value} htmlFor={inputId} className={clsx(
                  'cursor-pointer rounded border px-2.5 py-1.5 text-xs',
                  confidence === value ? 'border-violet-400 bg-violet-100 text-violet-900' : 'border-zinc-200 bg-white text-zinc-600',
                )}>
                  <input
                    id={inputId}
                    name={`${formId}-confidence`}
                    type="radio"
                    value={value}
                    checked={confidence === value}
                    onChange={() => setConfidence(value)}
                    className="sr-only"
                  />
                  {value}{value === 1 ? ' · low' : value === 5 ? ' · high' : ''}
                </label>
              )
            })}
          </div>
        </fieldset>
      )}

      <label className="mt-3 block text-xs font-medium text-zinc-700">
        Written rationale
        <textarea
          value={rationale}
          onChange={event => setRationale(event.target.value)}
          rows={3}
          required
          minLength={rationaleMinimum}
          aria-describedby={`${formId}-rationale-help`}
          className="mt-1 block w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>
      <p id={`${formId}-rationale-help`} className={clsx('mt-1 text-xs', downgrade ? 'font-medium text-red-700' : 'text-zinc-500')}>
        {downgrade
          ? 'Required control: excluding a record previously assessed as relevant or uncertain requires a specific written rationale and an independent second review before completion.'
          : `Required: explain the evidence supporting this ${isProvisional ? 'provisional' : 'regulatory'} disposition (at least ${rationaleMinimum} characters).`}
      </p>

      {downgrade && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="status">
          <strong>Material downgrade.</strong> Saving this exclusion will lock the regulatory disposition in a second-review-pending state. A different qualified reviewer must confirm it before run approval.
        </div>
      )}

      {!canSubmitPhase && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          {isSecondReview
            ? 'Your current assignment does not permit second review. A different qualified reviewer with a secondary assignment must complete this step.'
            : 'Your current assignment does not permit primary adjudication.'}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-700" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={!valid || submitting}
        aria-busy={submitting}
        className="mt-3 rounded-md bg-[#0D9488] px-3 py-2 text-xs font-medium text-white hover:bg-[#0B8177] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Saving…' : isProvisional ? 'Lock provisional decision and reveal AI' : isSecondReview ? 'Submit second review' : stage === 'resolution_required' ? 'Submit superseding final decision' : 'Submit final disposition'}
      </button>
    </form>
  )
}

export function RecordAdjudication({
  record,
  runId,
  credentials,
  permissions,
  onSaved,
}: {
  record: AdjudicationRecord
  runId: string
  credentials: ReviewerCredentials
  permissions: AdjudicationPermissions
  onSaved: () => Promise<void>
}) {
  const stage = adjudicationStage(record)

  return (
    <section className="mt-3 space-y-2" aria-label="Human adjudication">
      {record.requirement_reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Reasons review is required">
          {record.requirement_reasons.map(reason => (
            <span key={reason} className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">{formatRequirement(reason)}</span>
          ))}
        </div>
      )}

      {stage === 'provisional_blind' && (
        <div className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900" role="status">
          <strong>Blind validation record.</strong> The AI label, confidence, rationale, model and prompt version are withheld until your provisional decision is persisted.
        </div>
      )}

      {record.provisional_blind && <ExistingEvent label="Locked provisional decision" event={record.provisional_blind} />}
      {stage !== 'provisional_blind' && <AiAssessment record={record} />}
      {record.final && <ExistingEvent label="Regulatory disposition" event={record.final} />}
      {record.second_review && <ExistingEvent label="Second-review disposition" event={record.second_review} />}

      {record.final?.requires_second_review && !record.second_review && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          <strong>Independent second review required.</strong> This record cannot be completed or included in run approval until a different qualified reviewer submits a matching disposition.
        </div>
      )}
      {stage === 'resolution_required' && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          <strong>Reviewer disagreement unresolved.</strong> The primary and second-review dispositions differ. The record remains blocked until a superseding final decision resolves the disagreement.
        </div>
      )}

      {(stage === 'provisional_blind' || stage === 'final' || stage === 'second_review' || stage === 'resolution_required') && (
        <DispositionForm
          key={`${record.fsn_result.id}-${stage}-${record.final?.id ?? 'none'}-${record.second_review?.id ?? 'none'}`}
          record={record}
          runId={runId}
          stage={stage}
          credentials={credentials}
          permissions={permissions}
          onSaved={onSaved}
        />
      )}

      {stage === 'complete' && (
        <p className="text-xs font-medium text-green-700" role="status">✓ Required human adjudication complete</p>
      )}
      {stage === 'not_required' && (
        <p className="text-xs text-zinc-500">No individual human disposition is required by this run&apos;s review policy.</p>
      )}
    </section>
  )
}
