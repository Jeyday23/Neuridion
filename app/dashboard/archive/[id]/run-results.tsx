'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { clsx } from 'clsx'
import { apiFetch } from '@/lib/fetch'
import { useToast } from '@/app/components/ui/ToastProvider'
import { messageFromError } from '@/lib/ui/api-error-message'
import { fmtSourceDb } from '@/lib/domain/source-labels'
import { groupFdaSignals } from '@/lib/signals/fda-signal-groups'
import { isReportApproved } from '@/lib/reports/review-gate'
import type { SourceResultBreakdown } from '@/app/dashboard/search-context'
import {
  RecordAdjudication,
  ReviewerQualification,
  adjudicationStage,
  type AdjudicationRecord,
  type AdjudicationPermissions,
  type AdjudicationsResponse,
  type ReviewerCredentials,
} from './adjudication-review'

function fmtSourceStatus(status: SourceResultBreakdown['status']): string {
  switch (status) {
    case 'complete_with_fallback':
      return 'Complete via fallback'
    case 'complete':
      return 'Complete'
    case 'empty':
      return 'Empty'
    case 'partial':
      return 'Partial'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}

export interface FsnResult {
  id: string
  title: string
  manufacturer: string | null
  product_name: string | null
  raw_content: string | null
  fsn_date: string | null
  source_url: string | null
  source_db: string
}

function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

type Tab = 'review' | 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed' | 'raw'

export function filterFailedExplanation(rationale: string | null | undefined): string {
  const text = rationale?.trim()
  if (!text) return 'AI assessment was unavailable for this item. Manual PRRC review is required.'
  if (/run item limit|review cap|item cap|filter cap/i.test(text)) {
    return text
  }
  if (/anthropic|provider|billing|authentication|credit|api key|not currently usable/i.test(text)) {
    return text
  }
  if (/disabled|gdpr|cancelled|time limit|timeout/i.test(text)) {
    return text
  }
  return text
}

function ResultRow({
  result,
  adjudication,
  runId,
  credentials,
  permissions,
  onAdjudicationSaved,
  loadingAdjudications,
  adjudicationError,
}: {
  result: FsnResult
  adjudication: AdjudicationRecord | null
  runId: string
  credentials: ReviewerCredentials
  permissions: AdjudicationPermissions | null
  onAdjudicationSaved: () => Promise<void>
  loadingAdjudications: boolean
  adjudicationError: string | null
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const isExcluded = adjudication?.filter_decision?.decision === 'excluded'

  return (
    <article className={clsx('border-b border-zinc-100 px-4 py-4 last:border-b-0', isExcluded && adjudication?.complete && 'bg-zinc-50/40')}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={safeHref(result.source_url)}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                'text-sm font-medium hover:underline',
                isExcluded ? 'text-zinc-500' : 'text-zinc-900 hover:text-[#0D9488]'
              )}
            >
              {result.title}
            </a>
            {adjudication?.blind_review_required && !adjudication.provisional_blind && (
              <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                Blind review
              </span>
            )}
            {adjudication?.complete && (
              <span className="inline-flex rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                Human review complete
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-zinc-500">
            {result.manufacturer && <span>{result.manufacturer}</span>}
            {result.fsn_date && (
              <span>
                {new Date(result.fsn_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            )}
            <span className="text-zinc-400">{fmtSourceDb(result.source_db)}</span>
          </div>

          <button
            type="button"
            aria-expanded={detailsExpanded}
            onClick={() => setDetailsExpanded(value => !value)}
            className="mt-2 text-xs font-medium text-[#0D9488] hover:text-[#0B8177]"
          >
            {detailsExpanded ? 'Hide source evidence' : 'Review source evidence'}
          </button>
          {detailsExpanded && (
            <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700">
              {result.product_name && <p><strong>Product:</strong> {result.product_name}</p>}
              <p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap">{result.raw_content?.trim() || 'No additional source text was stored for this record. Open the source record for the full evidence.'}</p>
            </div>
          )}

          {loadingAdjudications && (
            <p className="mt-3 text-xs text-zinc-500" role="status">Loading protected review state…</p>
          )}
          {!loadingAdjudications && adjudicationError && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              AI assessment remains withheld because the protected adjudication state could not be loaded.
            </div>
          )}
          {!loadingAdjudications && !adjudicationError && adjudication && (
            <RecordAdjudication
              record={adjudication}
              runId={runId}
              credentials={credentials}
              permissions={permissions ?? {
                is_owner: false,
                assignment_role: null,
                can_primary_review: false,
                can_second_review: false,
              }}
              onSaved={onAdjudicationSaved}
            />
          )}
          {!loadingAdjudications && !adjudicationError && !adjudication && (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
              Protected review state is not available for this record. Run approval remains blocked.
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

export function RunResults({ results, runId, runStatus, reviewStatus: initialReviewStatus, hasReport: initialHasReport, sourceBreakdown }: {
  results: FsnResult[]
  runId: string
  runStatus: string
  reviewStatus: string
  hasReport: boolean
  sourceBreakdown: SourceResultBreakdown[] | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('review')
  const [reviewStatus, setReviewStatus] = useState(initialReviewStatus)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reportGenerated, setReportGenerated] = useState(initialHasReport)
  const [generatingReport, setGeneratingReport] = useState(false)
  const reportPendingRef = useRef(false)
  const [reviewedAt, setReviewedAt] = useState<string | null>(null)
  const [reviewedBy, setReviewedBy] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [selfApproval, setSelfApproval] = useState(false)
  const [confirmingSelfApproval, setConfirmingSelfApproval] = useState(false)
  const [adjudications, setAdjudications] = useState<AdjudicationsResponse | null>(null)
  const [loadingAdjudications, setLoadingAdjudications] = useState(true)
  const [adjudicationError, setAdjudicationError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<ReviewerCredentials>({
    role: '',
    qualificationAttestation: '',
    attestsQualified: false,
  })

  const loadAdjudications = useCallback(async () => {
    setLoadingAdjudications(true)
    setAdjudicationError(null)
    try {
      const response = await apiFetch(`/api/search-runs/${runId}/adjudications`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Protected review state could not be loaded.')
      }
      const body = await response.json() as AdjudicationsResponse
      setAdjudications(body)
      setReviewStatus(body.review_status)
    } catch (caught) {
      setAdjudications(null)
      setAdjudicationError(caught instanceof Error
        ? caught.message
        : 'Protected review state could not be loaded.')
    } finally {
      setLoadingAdjudications(false)
    }
  }, [runId])

  useEffect(() => {
    void loadAdjudications()
  }, [loadAdjudications])

  async function handleReview(newStatus: 'reviewed' | 'approved') {
    if (newStatus === 'approved' && !confirmingSelfApproval) {
      setConfirmingSelfApproval(true)
      return
    }
    setConfirmingSelfApproval(false)
    setReviewLoading(true)
    setReviewError(null)
    try {
      const res = await apiFetch(`/api/search-runs/${runId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        setReviewStatus(data.review_status)
        setReviewedAt(data.reviewed_at)
        setReviewedBy(data.reviewed_by ?? null)
        if (data.self_approval) setSelfApproval(true)
      } else {
        setReviewError('Failed to update review status. Please try again.')
      }
    } catch {
      setReviewError('Network error. Please check your connection and try again.')
    } finally {
      setReviewLoading(false)
    }
  }

  async function handleGenerateReport() {
    if (reportPendingRef.current) return
    reportPendingRef.current = true
    setGeneratingReport(true)
    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      if (!res.ok) {
        if (res.status === 429) { toast.show('Too many requests — please wait a moment.', 'error'); return }
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to generate report')
      }
      setReportGenerated(true)
      toast.show('Report generated successfully.', 'success')
      router.refresh()
    } catch (err) {
      toast.show(messageFromError(err, 'Report generation failed — please try again.'), 'error')
    } finally {
      reportPendingRef.current = false
      setGeneratingReport(false)
    }
  }

  function exportRawCsv() {
    const header = 'Title,Manufacturer,Date,Source,URL'
    const csvRows = results.map(r => {
      const esc = (s: string | null) => {
        if (!s) return ''
        let escaped = s.replace(/"/g, '""')
        if (/^[=+\-@\t\r|]/.test(escaped)) escaped = "'" + escaped
        return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') ? `"${escaped}"` : escaped
      }
      return [esc(r.title), esc(r.manufacturer), esc(r.fsn_date), esc(r.source_db), esc(r.source_url)].join(',')
    })
    const csv = [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `neuridion-raw-results-${runId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const adjudicationByResult = new Map(
    (adjudications?.records ?? []).map(record => [record.fsn_result.id, record]),
  )
  const decisionFor = (result: FsnResult) => adjudicationByResult.get(result.id)?.filter_decision?.decision
  const stageFor = (result: FsnResult) => {
    const record = adjudicationByResult.get(result.id)
    return record ? adjudicationStage(record) : null
  }
  const priority: Record<string, number> = {
    provisional_blind: 0,
    final: 1,
    second_review: 2,
    resolution_required: 3,
    relevant: 4,
    uncertain: 5,
    filter_failed: 6,
    excluded: 7,
    complete: 8,
    not_required: 9,
  }
  const sorted = [...results].sort((left, right) => {
    const leftKey = stageFor(left) ?? decisionFor(left) ?? 'not_required'
    const rightKey = stageFor(right) ?? decisionFor(right) ?? 'not_required'
    return (priority[leftKey] ?? 99) - (priority[rightKey] ?? 99)
  })

  const counts = {
    all: results.length,
    review: results.filter(result => {
      const stage = stageFor(result)
      return stage !== null && stage !== 'complete' && stage !== 'not_required'
    }).length,
    relevant: results.filter(result => decisionFor(result) === 'relevant').length,
    uncertain: results.filter(result => decisionFor(result) === 'uncertain').length,
    excluded: results.filter(result => decisionFor(result) === 'excluded').length,
    filter_failed: results.filter(result => decisionFor(result) === 'filter_failed').length,
  }
  const rawSourceTotal = sourceBreakdown?.reduce((sum, source) => sum + source.found_before_filtering, 0) ?? results.length
  const aiCountsBySource = new Map<string, { retained: number; excluded: number; unprocessed: number; withheld: number }>()
  for (const result of results) {
    const source = result.source_db
    const existing = aiCountsBySource.get(source) ?? { retained: 0, excluded: 0, unprocessed: 0, withheld: 0 }
    const adjudication = adjudicationByResult.get(result.id)
    const decision = adjudication?.filter_decision?.decision
    if (decision === 'relevant' || decision === 'uncertain') existing.retained += 1
    else if (decision === 'excluded') existing.excluded += 1
    else if (decision === 'filter_failed') existing.unprocessed += 1
    else if (adjudication?.blind_review_required && !adjudication.ai_revealed) existing.withheld += 1
    aiCountsBySource.set(source, existing)
  }
  const fdaSignals = groupFdaSignals(results)

  const filtered = tab === 'all'
    ? sorted
    : tab === 'review'
      ? sorted.filter(result => {
          const stage = stageFor(result)
          return stage !== null && stage !== 'complete' && stage !== 'not_required'
        })
      : sorted.filter(result => decisionFor(result) === tab)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'review',        label: `Review queue (${counts.review})` },
    { key: 'all',           label: `All (${counts.all})` },
    { key: 'relevant',      label: `AI relevant (${counts.relevant})` },
    { key: 'uncertain',     label: `AI uncertain (${counts.uncertain})` },
    { key: 'excluded',      label: `AI excluded (${counts.excluded})` },
    ...(counts.filter_failed > 0
      ? [{ key: 'filter_failed' as Tab, label: `Unprocessed (${counts.filter_failed})` }]
      : []),
    { key: 'raw',           label: `Raw Data (${counts.all})` },
  ]
  const approvalReady = adjudications?.summary.ready_for_approval === true
  const reviewStateUnavailable = loadingAdjudications || Boolean(adjudicationError) || !adjudications

  return (
    <div>
      {(runStatus === 'complete' || runStatus === 'degraded') && (
        <div className={clsx(
          'mb-4 rounded-lg border px-4 py-3 flex items-center gap-3 text-sm',
          reviewStatus === 'approved' ? 'bg-green-50 border-green-200' :
          reviewStatus === 'reviewed' ? 'bg-blue-50 border-blue-200' :
          'bg-amber-50 border-amber-200'
        )}>
          <span className={clsx(
            'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
            reviewStatus === 'approved' ? 'bg-green-100 text-green-800 border-green-300' :
            reviewStatus === 'reviewed' ? 'bg-blue-100 text-blue-800 border-blue-300' :
            'bg-amber-100 text-amber-800 border-amber-300'
          )}>
            {reviewStatus === 'approved' ? 'Approved' : reviewStatus === 'reviewed' ? 'Reviewed' : 'Draft'}
          </span>
          <span className="text-zinc-600 flex-1">
            {reviewStatus === 'approved' && `Approved${reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`}
            {reviewStatus === 'reviewed' && `Reviewed${reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}`}
            {reviewStatus === 'draft' && 'This run has not been reviewed yet.'}
          </span>
          {reviewStatus === 'draft' && (
            <button
              onClick={() => handleReview('reviewed')}
              disabled={reviewLoading || reviewStateUnavailable || !approvalReady}
              aria-describedby={!approvalReady ? 'run-review-readiness' : undefined}
              className="ml-auto px-3 py-1.5 bg-[#0D9488] text-white rounded-lg text-xs font-medium hover:bg-[#0B8177] disabled:opacity-50"
            >
              {reviewLoading ? 'Saving...' : 'Mark as Reviewed'}
            </button>
          )}
          {reviewStatus === 'reviewed' && !confirmingSelfApproval && (
            <button
              onClick={() => handleReview('approved')}
              disabled={reviewLoading || reviewStateUnavailable || !approvalReady}
              aria-describedby={!approvalReady ? 'run-review-readiness' : undefined}
              className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {reviewLoading ? 'Saving...' : 'Approve'}
            </button>
          )}
          {reviewStatus === 'approved' && selfApproval && (
            <span className="text-xs text-zinc-400 italic">Self-approved (logged)</span>
          )}
        </div>
      )}

      {confirmingSelfApproval && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800">Self-approval acknowledgement</p>
          <p className="mt-1 text-amber-700">
            You are approving a run you reviewed. Confirm that this is permitted by your organisation&apos;s controlled procedure and that every required independent second review has been completed. The self-approval will be recorded in the audit trail.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setConfirmingSelfApproval(false)}
              className="px-3 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleReview('approved')}
              disabled={reviewLoading}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {reviewLoading ? 'Saving...' : 'Confirm Approval'}
            </button>
          </div>
        </div>
      )}

      {reviewError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {reviewError}
        </div>
      )}

      {(runStatus === 'complete' || runStatus === 'degraded') && (
        <section className="mb-6 space-y-3" aria-labelledby="human-review-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 id="human-review-heading" className="text-sm font-semibold text-zinc-900">Controlled human review</h2>
              <p className="mt-0.5 text-xs text-zinc-600">AI output is supporting evidence. The signed human disposition is the regulatory decision.</p>
            </div>
            {adjudications && (
              <span className={clsx(
                'rounded border px-2 py-1 text-xs font-medium',
                approvalReady ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800',
              )}>
                {adjudications.summary.completed_records}/{adjudications.summary.required_records} required records complete
              </span>
            )}
          </div>

          {loadingAdjudications && <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600" role="status">Loading protected review state…</p>}
          {!loadingAdjudications && adjudicationError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              <p>{adjudicationError}</p>
              <button type="button" onClick={() => void loadAdjudications()} className="mt-2 font-medium underline underline-offset-2">Retry protected review load</button>
            </div>
          )}
          {adjudications && (
            <>
              <ReviewerQualification value={credentials} onChange={setCredentials} />
              <div id="run-review-readiness" className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600" role="status">
                {approvalReady
                  ? 'All required record dispositions and independent second reviews are complete. The run-level review gate is available.'
                  : `${adjudications.summary.pending_records} required disposition${adjudications.summary.pending_records === 1 ? '' : 's'} and ${adjudications.summary.second_review_pending} second review${adjudications.summary.second_review_pending === 1 ? '' : 's'} remain before run approval.`}
              </div>
            </>
          )}
        </section>
      )}

      {isReportApproved(reviewStatus) && !reportGenerated && (runStatus === 'complete' || runStatus === 'degraded') && (
        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-violet-700 flex-1">
            Results approved — you can now generate your compliance report.
          </span>
          <button
            onClick={handleGenerateReport}
            disabled={generatingReport}
            aria-busy={generatingReport}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
          >
            {generatingReport ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      )}

      {reportGenerated && isReportApproved(reviewStatus) && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-green-700 flex-1">
            Report generated. Download it from the archive.
          </span>
          <Link
            href="/dashboard/archive"
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 whitespace-nowrap"
          >
            Go to Archive
          </Link>
        </div>
      )}

      {counts.filter_failed > 0 && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{counts.filter_failed} item{counts.filter_failed !== 1 ? 's were' : ' was'} not processed by AI</strong> — these items could not receive an AI relevance classification for this run. Manual review required.
        </div>
      )}

      <section className="mb-6 rounded-md border border-[#E2E8F0] bg-white p-4" aria-labelledby="source-audit-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="source-audit-heading" className="text-sm font-semibold text-zinc-900">Source results and AI relevance filtering</h2>
          <span className="text-xs text-zinc-500">{rawSourceTotal} raw source result{rawSourceTotal !== 1 ? 's' : ''}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">
          Raw source results are the deduplicated records NEURIDION retrieved for the selected source query and time period before AI relevance filtering. AI retained means the AI classified the record as relevant or uncertain for PRRC review.
        </p>
        {sourceBreakdown && sourceBreakdown.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded border border-zinc-100">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Raw found</th>
                  <th className="px-3 py-2 text-right font-medium">Keyword signal</th>
                  <th className="px-3 py-2 text-right font-medium">AI retained</th>
                  <th className="px-3 py-2 text-right font-medium">AI excluded</th>
                  <th className="px-3 py-2 text-right font-medium">Unprocessed</th>
                  <th className="px-3 py-2 text-right font-medium">Blind review</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sourceBreakdown.map((source) => {
                  const aiCounts = aiCountsBySource.get(source.source) ?? { retained: 0, excluded: 0, unprocessed: 0, withheld: 0 }
                  return (
                    <tr key={source.source} className="border-t border-zinc-100">
                      <td className="px-3 py-2 text-zinc-800">{fmtSourceDb(source.source)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-zinc-900">{source.found_before_filtering}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{source.after_keyword_signal}</td>
                      <td className="px-3 py-2 text-right text-green-700">{aiCounts.retained}</td>
                      <td className="px-3 py-2 text-right text-zinc-500">{aiCounts.excluded}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{aiCounts.unprocessed}</td>
                      <td className="px-3 py-2 text-right text-violet-700">{aiCounts.withheld}</td>
                      <td className="px-3 py-2 text-zinc-600">
                        {fmtSourceStatus(source.status)}
                        {source.warnings > 0 && <span className="text-amber-700"> · {source.warnings} warning{source.warnings !== 1 ? 's' : ''}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Source-stage breakdown is unavailable for runs created before raw-result audit tracking was enabled.
          </p>
        )}
      </section>

      {fdaSignals.length > 0 && (
        <section className="mb-6 rounded-md border border-blue-200 bg-blue-50/40 p-4" aria-labelledby="fda-signals-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="fda-signals-heading" className="text-sm font-semibold text-zinc-900">FDA MAUDE signal groups</h2>
            <span className="text-xs text-zinc-500">{fdaSignals.length} group{fdaSignals.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            Repeated adverse-event reports are grouped by product and reported problem. These are signals for review, not confirmed hazards or recalls; every underlying report remains available in Raw Data.
          </p>
          <div className="mt-3 overflow-x-auto rounded border border-blue-100 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-left font-medium">Reported problem</th>
                  <th className="px-3 py-2 text-right font-medium">Reports</th>
                  <th className="px-3 py-2 text-left font-medium">Period</th>
                </tr>
              </thead>
              <tbody>
                {fdaSignals.slice(0, 10).map((signal) => (
                  <tr key={signal.key} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-800">{signal.product}</td>
                    <td className="px-3 py-2 text-zinc-600">{signal.failureMode}</td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-700">{signal.reportCount}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                      {signal.firstReported ? new Date(signal.firstReported).toLocaleDateString('en-GB') : '—'} → {signal.lastReported ? new Date(signal.lastReported).toLocaleDateString('en-GB') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fdaSignals.length > 10 && <p className="mt-2 text-xs text-zinc-500">Showing the 10 largest groups. The generated report contains up to 20 groups.</p>}
        </section>
      )}

      <div role="tablist" className="flex gap-1 border-b border-zinc-200 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls="results-tabpanel"
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? t.key === 'filter_failed'
                  ? 'border-red-600 text-red-700'
                  : 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="results-tabpanel" role="tabpanel">
      {tab === 'raw' ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">{results.length} raw source result{results.length !== 1 ? 's' : ''} from {new Set(results.map(r => r.source_db)).size} database{new Set(results.map(r => r.source_db)).size !== 1 ? 's' : ''} — no AI filtering applied</span>
            <button
              onClick={exportRawCsv}
              className="text-xs border border-zinc-300 rounded px-2.5 py-1 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-400 transition-colors"
            >
              ↓ Export CSV
            </button>
          </div>
          <div className="rounded-md border border-[#E2E8F0] bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Manufacturer</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Source</th>
                  <th className="px-4 py-2.5 text-left font-medium text-zinc-600 text-xs">Source URL</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 last:border-b-0">
                    <td className="px-4 py-2.5">
                      <a
                        href={safeHref(r.source_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-zinc-900 hover:text-[#0D9488] hover:underline"
                      >
                        {r.title}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">{r.manufacturer || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                      {r.fsn_date ? new Date(r.fsn_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{fmtSourceDb(r.source_db)}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400 max-w-[200px] truncate">
                      {r.source_url ? (
                        <a href={safeHref(r.source_url)} target="_blank" rel="noopener noreferrer" className="hover:text-[#0D9488] hover:underline">{r.source_url}</a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 py-8 text-center">No results in this category.</p>
      ) : (
        <div className="rounded-md border border-[#E2E8F0] bg-white">
          {filtered.map((result) => (
            <ResultRow
              key={result.id}
              result={result}
              adjudication={adjudicationByResult.get(result.id) ?? null}
              runId={runId}
              credentials={credentials}
              permissions={adjudications?.permissions ?? null}
              onAdjudicationSaved={loadAdjudications}
              loadingAdjudications={loadingAdjudications}
              adjudicationError={adjudicationError}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
