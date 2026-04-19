'use client'

import { useState } from 'react'
import { format, subMonths } from 'date-fns'
import { clsx } from 'clsx'
import { Plus, Upload } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Database list ────────────────────────────────────────────────────────────

const databases = [
  { id: 'bfarm',        name: 'BfArM Database',               region: 'Germany',      active: true  },
  { id: 'fda',          name: 'FDA MAUDE',                    region: 'USA',          active: false },
  { id: 'swissmedic',   name: 'Swissmedic',                   region: 'Switzerland',  active: false },
  { id: 'eudamed',      name: 'EUDAMED',                      region: 'EU',           active: false },
  { id: 'mhra',         name: 'MHRA - Medical Device Alerts', region: 'UK',           active: false },
  { id: 'tga',          name: 'TGA Database',                 region: 'Australia',    active: false },
  { id: 'health-canada',name: 'Health Canada',                region: 'Canada',       active: false },
  { id: 'pmda',         name: 'PMDA',                         region: 'Japan',        active: false },
  { id: 'anvisa',       name: 'ANVISA',                       region: 'Brazil',       active: false },
  { id: 'medsafe',      name: 'Medsafe',                      region: 'New Zealand',  active: false },
  { id: 'hsa',          name: 'HSA',                          region: 'Singapore',    active: false },
  { id: 'cdsco',        name: 'CDSCO',                        region: 'India',        active: false },
  { id: 'sahpra',       name: 'SAHPRA',                       region: 'South Africa', active: false },
  { id: 'cofepris',     name: 'COFEPRIS',                     region: 'Mexico',       active: false },
]

// ─── Decision badge ───────────────────────────────────────────────────────────

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

// ─── Single FSN row ───────────────────────────────────────────────────────────

function FsnRow({ result }: { result: FsnResult }) {
  const [expanded, setExpanded] = useState(false)
  const d = result.filter_decision
  const isExcluded = d?.decision === 'excluded'

  return (
    <div className={clsx('border-b border-zinc-100 last:border-b-0 px-4 py-3', isExcluded && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={result.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx('text-sm font-medium hover:underline', isExcluded ? 'text-zinc-500' : 'text-zinc-900 hover:text-blue-600')}
            >
              {result.title}
            </a>
            {d && <DecisionBadge decision={d.decision} />}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-zinc-500">
            {result.manufacturer && <span>{result.manufacturer}</span>}
            {result.fsn_date && (
              <span>{new Date(result.fsn_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            )}
            <span className="uppercase tracking-wide text-zinc-400">{result.source}</span>
            {d && <span className="text-zinc-400">{Math.round(d.confidence * 100)}% confidence</span>}
          </div>

          {d && d.decision !== 'excluded' && (
            <p className={clsx('mt-1.5 text-xs leading-relaxed', d.decision === 'uncertain' ? 'text-amber-700' : 'text-zinc-500')}>
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
            <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SearchPanel({ profiles }: { profiles: Profile[] }) {
  const today   = format(new Date(), 'yyyy-MM-dd')
  const yearAgo = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

  const [profileId, setProfileId]     = useState(profiles[0]?.id ?? '')
  const [fromDate, setFromDate]       = useState(yearAgo)
  const [toDate, setToDate]           = useState(today)
  const [state, setState]             = useState<RunState>({ phase: 'idle' })
  const [reportState, setReportState] = useState<ReportState>({ phase: 'idle' })

  // Database checkbox state — only bfarm is actually wired up
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(new Set(['bfarm']))
  const [hoveredDb, setHoveredDb]     = useState<string | null>(null)

  const activeDbs = databases.filter((d) => d.active)
  const allActiveSelected = activeDbs.every((d) => selectedDbs.has(d.id))

  function toggleDb(id: string) {
    const db = databases.find((d) => d.id === id)
    if (!db?.active) return
    setSelectedDbs((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedDbs(allActiveSelected ? new Set() : new Set(activeDbs.map((d) => d.id)))
  }

  function formatDateDE(s: string) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE')
  }

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
    <div className="max-w-6xl mx-auto p-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">1</div>
          <h1 className="text-3xl font-bold text-slate-900">Define Search Strategy</h1>
        </div>
        <p className="text-slate-600 ml-14">Select databases and configure search parameters for your PMS search</p>
      </div>

      <div className="space-y-8">
        {/* Profile selector */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Product Profile <span className="text-red-500">*</span>
          </h2>
          {noProfiles ? (
            <p className="text-sm text-slate-500">
              No profiles yet —{' '}
              <a href="/dashboard/profiles/new" className="text-blue-600 hover:underline">create one</a>
            </p>
          ) : (
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.device_name} — {p.manufacturer}</option>
              ))}
            </select>
          )}
        </section>

        {/* Databases */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              Databases ({selectedDbs.size} selected) <span className="text-red-500">*</span>
            </h2>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-900">
              <input
                type="checkbox"
                checked={allActiveSelected}
                onChange={toggleAll}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Select / deselect all
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {databases.map((db) => (
              <div
                key={db.id}
                className="relative"
                onMouseEnter={() => !db.active && setHoveredDb(db.id)}
                onMouseLeave={() => setHoveredDb(null)}
              >
                <label
                  className={`flex items-start gap-3 p-4 border rounded-lg transition-all cursor-pointer ${
                    db.active
                      ? selectedDbs.has(db.id)
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                      : 'border-slate-200 bg-slate-50 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDbs.has(db.id)}
                    onChange={() => toggleDb(db.id)}
                    disabled={!db.active}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900 text-sm">{db.name}</div>
                    <div className="text-xs text-slate-500">{db.region}</div>
                  </div>
                </label>
                {!db.active && hoveredDb === db.id && (
                  <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg shadow-lg z-10 whitespace-nowrap">
                    Coming soon
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-purple-600 rotate-45" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Search period */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Search Period <span className="text-red-500">*</span>
          </h2>
          <div className="flex items-center gap-6 max-w-xl">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">From</label>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="text-sm text-slate-500 mt-1">{formatDateDE(fromDate)}</div>
            </div>
            <div className="text-slate-400 mt-8">→</div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">To</label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="text-sm text-slate-500 mt-1">{formatDateDE(toDate)}</div>
            </div>
          </div>
        </section>

        {/* Generic search terms */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Search Terms — Generic Search</h2>
          <p className="text-sm text-slate-500 italic mb-6">
            Use AND, OR, NOT to combine terms, e.g. &apos;Infusion pump&apos; OR (Infusion AND pump AND volumetric)
          </p>
          <textarea
            rows={4}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder='"infusion pump" OR (infusion AND pump AND volumetric)'
          />
          <button className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm">
            <Plus className="w-4 h-4" />
            Add another search combination
          </button>
        </section>

        {/* Manufacturer & product names */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Search Terms — Manufacturer &amp; Product Names</h2>
          <p className="text-sm text-slate-500 italic mb-6">
            Direct search by manufacturer name or specific product name
          </p>
          <textarea
            rows={4}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder='"B. Braun" OR "BBraun" OR "Infusomat Space"'
          />
          <button className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm">
            <Plus className="w-4 h-4" />
            Add another search combination
          </button>
        </section>

        {/* File upload */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Search Strategy Documents</h2>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-700 font-medium mb-1">Drop files here or browse</p>
            <p className="text-sm text-slate-500">PDF, DOCX, XLSX and more</p>
          </div>
        </section>

        {/* Action bar — run search + save draft */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
          <button className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium">
            Save Draft
          </button>
          <button
            onClick={runSearch}
            disabled={noProfiles || state.phase === 'running'}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {state.phase === 'running' ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching…
              </>
            ) : (
              <>Create Profile &amp; Generate Search Protocol <span>→</span></>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {state.phase === 'error' && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.message}</p>
        </div>
      )}

      {/* Results */}
      {state.phase === 'done' && (
        <div className="mt-8">
          {/* Summary counts */}
          <div className="flex items-center gap-4 mb-4">
            {state.results.length === 0 ? (
              <p className="text-sm text-slate-500">No notices found for this period.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">
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
                <span className="text-xs text-zinc-400 ml-auto">AI-filtered · {MODEL_LABEL}</span>
              </>
            )}
          </div>

          {/* Report generation */}
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
                  <a href={reportState.pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                    <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Download PDF
                  </a>
                )}
                {reportState.excelUrl && (
                  <a href={reportState.excelUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
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

          {/* Results list */}
          {state.results.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
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
