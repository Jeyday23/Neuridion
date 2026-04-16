'use client'

import { useState } from 'react'
import { format, subMonths } from 'date-fns'
import { clsx } from 'clsx'

interface Profile {
  id: string
  device_name: string
  manufacturer: string
}

interface FilterDecision {
  decision: 'relevant' | 'uncertain' | 'excluded'
  rationale: string
  confidence: number
  model: string
}

interface FsnResult {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source: string
  filter_decision: FilterDecision | null
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; runId: string; results: FsnResult[]; counts: { relevant: number; uncertain: number; excluded: number } }
  | { phase: 'error'; message: string }

type ReportState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'ready'; pdfUrl: string | null; excelUrl: string | null }
  | { phase: 'error'; message: string }

// ---------------------------------------------------------------------------
// Decision badge
// ---------------------------------------------------------------------------
function DecisionBadge({ decision }: { decision: FilterDecision['decision'] }) {
  const styles = {
    relevant:  'bg-green-50 text-green-700 border-green-200',
    uncertain: 'bg-amber-50 text-amber-700 border-amber-200',
    excluded:  'bg-zinc-100 text-zinc-500 border-zinc-200',
  }
  const labels = { relevant: 'Relevant', uncertain: 'Uncertain', excluded: 'Excluded' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[decision]}`}>
      {labels[decision]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Single FSN row
// ---------------------------------------------------------------------------
function FsnRow({ result }: { result: FsnResult }) {
  const [expanded, setExpanded] = useState(false)
  const d = result.filter_decision
  const isExcluded = d?.decision === 'excluded'

  return (
    <div
      className={clsx(
        'border-b border-zinc-100 last:border-b-0 px-4 py-3',
        isExcluded && 'opacity-50'
      )}
    >
      {/* Main row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={result.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                'text-sm font-medium hover:underline',
                isExcluded ? 'text-zinc-500' : 'text-zinc-900 hover:text-blue-600'
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
            <span className="uppercase tracking-wide text-zinc-400">{result.source}</span>
            {d && (
              <span className="text-zinc-400">{Math.round(d.confidence * 100)}% confidence</span>
            )}
          </div>

          {/* Rationale (always shown for uncertain/relevant; expandable for excluded) */}
          {d && d.decision !== 'excluded' && (
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

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function SearchPanel({ profiles }: { profiles: Profile[] }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const yearAgo = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [fromDate, setFromDate] = useState(yearAgo)
  const [toDate, setToDate] = useState(today)
  const [state, setState] = useState<RunState>({ phase: 'idle' })
  const [reportState, setReportState] = useState<ReportState>({ phase: 'idle' })

  async function generateReport(runId: string) {
    setReportState({ phase: 'generating' })
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      const data = await res.json() as { pdf_url?: string | null; excel_url?: string | null; error?: string }
      if (!res.ok) {
        setReportState({ phase: 'error', message: data.error ?? 'Report generation failed.' })
        return
      }
      setReportState({ phase: 'ready', pdfUrl: data.pdf_url ?? null, excelUrl: data.excel_url ?? null })
    } catch (err) {
      setReportState({ phase: 'error', message: String(err) })
    }
  }

  async function runSearch() {
    if (!profileId) return
    setState({ phase: 'running' })
    setReportState({ phase: 'idle' })

    try {
      const res = await fetch('/api/search-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, period_from: fromDate, period_to: toDate }),
      })

      const data = await res.json() as {
        run_id?: string
        relevant_count?: number
        uncertain_count?: number
        excluded_count?: number
        error?: string
      }

      if (!res.ok) {
        const msg = data.error
        setState({ phase: 'error', message: typeof msg === 'string' ? msg : msg ? JSON.stringify(msg) : 'Search failed.' })
        return
      }

      // Fetch enriched results with filter decisions
      const detailRes = await fetch(`/api/search-runs/${data.run_id}`)
      const detail = await detailRes.json() as { results?: FsnResult[]; error?: string }

      if (!detailRes.ok) {
        setState({ phase: 'error', message: detail.error ?? 'Failed to load results.' })
        return
      }

      setState({
        phase: 'done',
        runId: data.run_id!,
        results: detail.results ?? [],
        counts: {
          relevant:  data.relevant_count  ?? 0,
          uncertain: data.uncertain_count ?? 0,
          excluded:  data.excluded_count  ?? 0,
        },
      })
    } catch (err) {
      setState({ phase: 'error', message: String(err) })
    }
  }

  const noProfiles = profiles.length === 0

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Search</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Run a recall / FSN search against BfArM for a product profile and date range.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-zinc-200 bg-white px-6 py-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {/* Profile selector */}
          <div className="flex-1 min-w-48">
            <label htmlFor="profile" className="block text-sm font-medium text-zinc-700 mb-1.5">
              Product profile
            </label>
            {noProfiles ? (
              <p className="text-sm text-zinc-400 py-2.5">
                No profiles yet —{' '}
                <a href="/dashboard/profiles/new" className="text-blue-600 hover:underline">
                  create one
                </a>
              </p>
            ) : (
              <select
                id="profile"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.device_name} — {p.manufacturer}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date range */}
          <div>
            <label htmlFor="from_date" className="block text-sm font-medium text-zinc-700 mb-1.5">From</label>
            <input
              id="from_date"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label htmlFor="to_date" className="block text-sm font-medium text-zinc-700 mb-1.5">To</label>
            <input
              id="to_date"
              type="date"
              value={toDate}
              min={fromDate}
              max={today}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button
            onClick={runSearch}
            disabled={noProfiles || state.phase === 'running'}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {state.phase === 'running' ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching…
              </span>
            ) : (
              'Run search'
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {state.phase === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-sm text-red-700">{state.message}</p>
        </div>
      )}

      {/* Results */}
      {state.phase === 'done' && (
        <div>
          {/* Summary counts */}
          <div className="flex items-center gap-4 mb-4">
            {state.results.length === 0 ? (
              <p className="text-sm text-zinc-500">No notices found for this period.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-700">
                  {state.results.length} notice{state.results.length !== 1 ? 's' : ''} found
                </p>
                <div className="flex items-center gap-3 text-xs">
                  {state.counts.relevant > 0 && (
                    <span className="flex items-center gap-1 text-green-700">
                      <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                      {state.counts.relevant} relevant
                    </span>
                  )}
                  {state.counts.uncertain > 0 && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                      {state.counts.uncertain} uncertain
                    </span>
                  )}
                  {state.counts.excluded > 0 && (
                    <span className="flex items-center gap-1 text-zinc-500">
                      <span className="h-2 w-2 rounded-full bg-zinc-300 inline-block" />
                      {state.counts.excluded} excluded
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400 ml-auto">
                  AI-filtered · {MODEL_LABEL}
                </span>
              </>
            )}
          </div>

          {/* Report generation */}
          {state.phase === 'done' && (
            <div className="flex items-center gap-3 mb-4">
              {reportState.phase === 'idle' && (
                <button
                  onClick={() => generateReport(state.runId)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Generate report
                </button>
              )}

              {reportState.phase === 'generating' && (
                <span className="flex items-center gap-2 text-sm text-zinc-500">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating PDF &amp; Excel…
                </span>
              )}

              {reportState.phase === 'ready' && (
                <>
                  {reportState.pdfUrl && (
                    <a
                      href={reportState.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      Download PDF
                    </a>
                  )}
                  {reportState.excelUrl && (
                    <a
                      href={reportState.excelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75-.125V5.625m0 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75.125V5.625m0 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-9.75 0h9.75" />
                      </svg>
                      Download Excel
                    </a>
                  )}
                </>
              )}

              {reportState.phase === 'error' && (
                <p className="text-sm text-red-600">{reportState.message}</p>
              )}
            </div>
          )}

          {state.results.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
              {/* Relevant + Uncertain first, Excluded at bottom */}
              {[
                ...state.results.filter((r) => r.filter_decision?.decision !== 'excluded'),
                ...state.results.filter((r) => r.filter_decision?.decision === 'excluded'),
              ].map((result) => (
                <FsnRow key={result.id} result={result} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const MODEL_LABEL = 'claude-sonnet-4-6'
