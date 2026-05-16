'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { apiFetch } from '@/lib/fetch'

export interface FsnResult {
  id: string
  title: string
  manufacturer: string | null
  fsn_date: string | null
  source_url: string | null
  source_db: string
  filter_decision: {
    decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
    rationale: string
    confidence: number | null
  } | null
}

function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

type Tab = 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed' | 'raw'

function formatSourceLabel(src: string | null | undefined): string {
  if (!src) return 'BfArM'
  const map: Record<string, string> = {
    bfarm:      'BfArM',
    fda:        'FDA MAUDE',
    maude:      'FDA MAUDE',
    mhra:       'MHRA',
    swissmedic: 'Swissmedic',
  }
  return map[src.toLowerCase()] ?? src.toUpperCase()
}

const DECISION_STYLES: Record<string, string> = {
  relevant:      'bg-green-50 text-green-700 border-green-200',
  uncertain:     'bg-amber-50 text-amber-700 border-amber-200',
  excluded:      'bg-zinc-100 text-zinc-500 border-zinc-200',
  filter_failed: 'bg-red-50 text-red-700 border-red-200',
}
const DECISION_LABELS: Record<string, string> = {
  relevant:      'Relevant',
  uncertain:     'Uncertain',
  excluded:      'Excluded',
  filter_failed: 'Not Reviewed',
}

function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${DECISION_STYLES[decision] ?? ''}`}>
      {DECISION_LABELS[decision] ?? decision}
    </span>
  )
}

function ResultRow({ result }: { result: FsnResult }) {
  const [expanded, setExpanded] = useState(false)
  const d = result.filter_decision
  const isExcluded = d?.decision === 'excluded'
  const isFailed   = d?.decision === 'filter_failed'

  return (
    <div className={clsx('border-b border-zinc-100 last:border-b-0 px-4 py-3', isExcluded && 'opacity-50')}>
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
            {d && <DecisionBadge decision={d.decision} />}
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
            <span className="text-zinc-400">{formatSourceLabel(result.source_db)}</span>
            {d && d.confidence != null && (
              <span className="text-zinc-400">{Math.round(d.confidence * 100)}% confidence</span>
            )}
          </div>

          {d && d.decision !== 'excluded' && d.decision !== 'filter_failed' && (
            <p className={clsx(
              'mt-1.5 text-xs leading-relaxed',
              d.decision === 'uncertain' ? 'text-amber-700' : 'text-zinc-500'
            )}>
              {d.rationale}
            </p>
          )}

          {d?.decision === 'uncertain' && (
            <p className="mt-1 text-xs font-medium text-amber-700 flex items-center gap-1">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Manual review required
            </p>
          )}

          {isFailed && (
            <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Not reviewed — manual review required
              </p>
              <p className="mt-0.5 text-xs text-amber-600">This item exceeded the AI filter cap for this run and was not assessed.</p>
            </div>
          )}

          {d?.decision === 'excluded' && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {expanded ? 'Hide reason ↑' : 'Why excluded? ↓'}
            </button>
          )}
          {d?.decision === 'excluded' && expanded && (
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{d.rationale}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function RunResults({ results, runId, runStatus, reviewStatus: initialReviewStatus }: {
  results: FsnResult[]
  runId: string
  runStatus: string
  reviewStatus: string
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [reviewStatus, setReviewStatus] = useState(initialReviewStatus)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewedAt, setReviewedAt] = useState<string | null>(null)
  const [reviewedBy, setReviewedBy] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [selfApproval, setSelfApproval] = useState(false)
  const [confirmingSelfApproval, setConfirmingSelfApproval] = useState(false)

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

  const sorted = [
    ...results.filter((r) => r.filter_decision?.decision === 'relevant'),
    ...results.filter((r) => r.filter_decision?.decision === 'uncertain'),
    ...results.filter((r) => r.filter_decision?.decision === 'filter_failed'),
    ...results.filter((r) => r.filter_decision?.decision === 'excluded'),
    ...results.filter((r) => !r.filter_decision),
  ]

  const counts = {
    all:           results.length,
    relevant:      results.filter((r) => r.filter_decision?.decision === 'relevant').length,
    uncertain:     results.filter((r) => r.filter_decision?.decision === 'uncertain').length,
    excluded:      results.filter((r) => r.filter_decision?.decision === 'excluded').length,
    filter_failed: results.filter((r) => r.filter_decision?.decision === 'filter_failed').length,
  }

  const filtered = tab === 'all'
    ? sorted
    : sorted.filter((r) => r.filter_decision?.decision === tab)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',           label: `All (${counts.all})` },
    { key: 'relevant',      label: `Relevant (${counts.relevant})` },
    { key: 'uncertain',     label: `Uncertain (${counts.uncertain})` },
    { key: 'excluded',      label: `Excluded (${counts.excluded})` },
    ...(counts.filter_failed > 0
      ? [{ key: 'filter_failed' as Tab, label: `Not Reviewed (${counts.filter_failed})` }]
      : []),
    { key: 'raw',           label: `Raw Data (${counts.all})` },
  ]

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
              disabled={reviewLoading}
              className="ml-auto px-3 py-1.5 bg-[#0D9488] text-white rounded-lg text-xs font-medium hover:bg-[#0B8177] disabled:opacity-50"
            >
              {reviewLoading ? 'Saving...' : 'Mark as Reviewed'}
            </button>
          )}
          {reviewStatus === 'reviewed' && !confirmingSelfApproval && (
            <button
              onClick={() => handleReview('approved')}
              disabled={reviewLoading}
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
            You are approving your own work. Under EU MDR Annex IX 4.5.5, independent review is required where possible. By proceeding, you confirm no independent reviewer is available and this self-approval will be documented in the audit trail.
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {reviewError}
        </div>
      )}

      {counts.filter_failed > 0 && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{counts.filter_failed} item{counts.filter_failed !== 1 ? 's were' : ' was'} not reviewed</strong> — these items exceeded the AI filter cap for this run and were not assessed. Manual review required.
        </div>
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
            <span className="text-xs text-zinc-500">{results.length} items scraped from {new Set(results.map(r => r.source_db)).size} database{new Set(results.map(r => r.source_db)).size !== 1 ? 's' : ''} — no AI filtering applied</span>
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
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{formatSourceLabel(r.source_db)}</td>
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
          {filtered.map((r) => <ResultRow key={r.id} result={r} />)}
        </div>
      )}
      </div>
    </div>
  )
}
