'use client'

import { useState, useRef } from 'react'
import { useSearchContext } from '../search-context'
import { format, subMonths } from 'date-fns'
import { clsx } from 'clsx'
import { Plus, Upload, X, CheckCircle, Loader2, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  device_name: string
  manufacturer: string
}

interface FilterDecision {
  decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale: string
  confidence: number | null
  model: string | null
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
  | { phase: 'ready'; pdfUrl: string | null; htmlUrl: string | null; excelUrl: string | null; pdfStatus: 'generated' | 'quota_exceeded' | 'failed' }
  | { phase: 'error'; message: string }

interface UploadedFile {
  key: string
  name: string
  path: string
  status: 'uploading' | 'done' | 'error'
}

type FilterTab = 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'

// ─── Source label formatter ───────────────────────────────────────────────────

function formatSourceLabel(src: string | null | undefined): string {
  if (!src) return 'BfArM'
  const map: Record<string, string> = {
    bfarm: 'BfArM',
    maude: 'FDA MAUDE',
    mhra:  'MHRA',
  }
  return map[src.toLowerCase()] ?? src.toUpperCase()
}

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

// ─── Decision config ──────────────────────────────────────────────────────────

const DOT_COLORS: Record<string, string> = {
  relevant:      '#22c55e',
  uncertain:     '#f59e0b',
  excluded:      '#9ca3af',
  filter_failed: '#ef4444',
}

const BADGE_STYLES: Record<string, string> = {
  relevant:      'bg-green-50 text-green-700 border-green-200',
  uncertain:     'bg-amber-50 text-amber-700 border-amber-200',
  excluded:      'bg-zinc-100 text-zinc-500 border-zinc-200',
  filter_failed: 'bg-red-50 text-red-700 border-red-200',
}

const BADGE_LABELS: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Review',
  excluded:      'Not Relevant',
  filter_failed: 'Filter Unavailable',
}

const PANEL_STYLES: Record<string, string> = {
  relevant:      'bg-green-50 border-green-200',
  uncertain:     'bg-amber-50 border-amber-200',
  excluded:      'bg-zinc-50 border-zinc-200',
  filter_failed: 'bg-red-50 border-red-200',
}

// ─── Enhanced FSN row ─────────────────────────────────────────────────────────

function FsnRow({
  result,
  expanded,
  onToggle,
}: {
  result: FsnResult
  expanded: boolean
  onToggle: () => void
}) {
  const d = result.filter_decision
  const dotColor = d ? (DOT_COLORS[d.decision] ?? '#9ca3af') : '#9ca3af'

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-zinc-50 transition-colors"
        onClick={onToggle}
      >
        {/* Decision dot */}
        <div
          className="mt-1.5 shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <a
              href={result.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-zinc-900 hover:text-blue-600 hover:underline line-clamp-2"
            >
              {result.title}
            </a>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500">
              {formatSourceLabel(result.source)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {result.manufacturer && <span>{result.manufacturer}</span>}
              {result.fsn_date && (
                <span>
                  {new Date(result.fsn_date).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </span>
              )}
            </div>
            {d && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[d.decision] ?? ''}`}>
                {BADGE_LABELS[d.decision] ?? d.decision}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={clsx(
            'w-4 h-4 text-zinc-400 shrink-0 mt-1 transition-transform duration-150',
            expanded && 'rotate-180'
          )}
        />
      </div>

      {/* Expanded rationale panel */}
      {expanded && (
        <div className="px-4 pb-4 ml-5">
          <div className={clsx(
            'rounded-lg border p-3 text-sm',
            d ? PANEL_STYLES[d.decision] : 'bg-zinc-50 border-zinc-200'
          )}>
            {!d && (
              <p className="text-xs text-zinc-500 italic">No AI assessment available for this item.</p>
            )}
            {d?.decision === 'filter_failed' && (
              <p className="text-xs font-medium text-red-700">
                AI filter was not applied — manual review required.
              </p>
            )}
            {d && d.decision !== 'filter_failed' && (
              <>
                <p className="text-xs font-semibold text-zinc-600 mb-1">AI Assessment</p>
                <p className="text-xs text-zinc-700 leading-relaxed">{d.rationale}</p>
              </>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
              {d?.confidence != null && (
                <span>Confidence: {Math.round(d.confidence * 100)}%</span>
              )}
              {d?.model && <span>Model: {d.model}</span>}
              <a
                href={result.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-blue-600 hover:underline text-xs"
              >
                View source ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={clsx(
      'fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg pointer-events-none',
      type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
    )}>
      {msg}
    </div>
  )
}

// ─── Search term row ──────────────────────────────────────────────────────────

function TermRow({
  value,
  onChange,
  onRemove,
  placeholder,
  showRemove,
}: {
  value: string
  onChange: (v: string) => void
  onRemove?: () => void
  placeholder: string
  showRemove: boolean
}) {
  return (
    <div className="relative">
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
        placeholder={placeholder}
      />
      {showRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 text-zinc-400 hover:text-red-500 transition-colors"
          aria-label="Remove"
        >
          <X className="w-4 h-4" />
        </button>
      )}
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
  const { searchState: state, setSearchState: setState } = useSearchContext()
  const [reportState, setReportState] = useState<ReportState>({ phase: 'idle' })

  // FIX 1 — array state for search term combinations
  const [genericTerms, setGenericTerms]           = useState<string[]>([''])
  const [manufacturerTerms, setManufacturerTerms] = useState<string[]>([''])

  // FIX 2 — expand/collapse + filter tab for results
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab]     = useState<FilterTab>('all')

  // FIX 2 — draft saving
  const [draftId, setDraftId]       = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)

  // FIX 4 — file upload
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging]       = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Database checkboxes
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(new Set(['bfarm']))
  const [hoveredDb, setHoveredDb]     = useState<string | null>(null)

  const activeDbs = databases.filter((d) => d.active)
  const allActiveSelected = activeDbs.every((d) => selectedDbs.has(d.id))

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

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

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function formatDateDE(s: string) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE')
  }

  async function saveDraft(successMsg = 'Draft saved') {
    setDraftSaving(true)
    try {
      const body = {
        id:                draftId ?? undefined,
        profile_id:        profileId || null,
        from:              fromDate,
        to:                toDate,
        dbs:               [...selectedDbs],
        genericTerms:      genericTerms.filter((t) => t.trim()),
        manufacturerTerms: manufacturerTerms.filter((t) => t.trim()),
        uploadedPaths:     uploadedFiles.filter((f) => f.status === 'done').map((f) => f.path),
      }
      const res  = await fetch('/api/search-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      if (data.id) setDraftId(data.id)
      showToast(successMsg)
    } catch (err) {
      showToast(String(err), 'error')
    } finally {
      setDraftSaving(false)
    }
  }

  async function saveProfileAndDraft() {
    await saveDraft('Draft saved. Click Run Search when ready.')
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        showToast(`${file.name} exceeds 10 MB limit`, 'error')
        continue
      }
      const key  = `${Date.now()}_${Math.random().toString(36).slice(2)}`
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `uploads/${key}_${safe}`
      setUploadedFiles((prev) => [...prev, { key, name: file.name, path, status: 'uploading' }])
      try {
        const { error } = await createClient().storage
          .from('search-attachments')
          .upload(path, file)
        setUploadedFiles((prev) =>
          prev.map((f) => f.key === key ? { ...f, status: error ? 'error' : 'done' } : f)
        )
        if (error) showToast(`Upload failed: ${file.name}`, 'error')
      } catch (err) {
        setUploadedFiles((prev) =>
          prev.map((f) => f.key === key ? { ...f, status: 'error' } : f)
        )
        showToast(`Upload failed: ${file.name}`, 'error')
        console.error('[upload]', err)
      }
    }
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave() { setIsDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  async function generateReport(runId: string) {
    setReportState({ phase: 'generating' })
    try {
      const res  = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      const data = await res.json() as {
        pdf_url?: string | null; html_url?: string | null; excel_url?: string | null
        pdf_status?: 'generated' | 'quota_exceeded' | 'failed'; error?: string
      }
      if (!res.ok) { setReportState({ phase: 'error', message: data.error ?? 'Report generation failed.' }); return }
      setReportState({
        phase: 'ready',
        pdfUrl:    data.pdf_url    ?? null,
        htmlUrl:   data.html_url   ?? null,
        excelUrl:  data.excel_url  ?? null,
        pdfStatus: data.pdf_status ?? 'failed',
      })
    } catch (err) {
      setReportState({ phase: 'error', message: String(err) })
    }
  }

  async function runSearch() {
    if (!profileId) return
    setState({ phase: 'running' })
    setReportState({ phase: 'idle' })
    setExpandedIds(new Set())
    setFilterTab('all')

    console.log('[client] Date range selected:', {
      from: fromDate, to: toDate,
      fromISO: new Date(fromDate).toISOString(), toISO: new Date(toDate).toISOString(),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userNow: new Date().toISOString(),
    })

    try {
      const res  = await fetch('/api/search-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, period_from: fromDate, period_to: toDate }),
      })
      const data = await res.json() as {
        run_id?: string; relevant_count?: number; uncertain_count?: number
        excluded_count?: number; error?: string
      }
      if (!res.ok) {
        const msg = data.error
        setState({ phase: 'error', message: typeof msg === 'string' ? msg : msg ? JSON.stringify(msg) : 'Search failed.' })
        return
      }

      const detailRes = await fetch(`/api/search-runs/${data.run_id}`)
      const detail    = await detailRes.json() as { results?: FsnResult[]; error?: string }
      if (!detailRes.ok) { setState({ phase: 'error', message: detail.error ?? 'Failed to load results.' }); return }

      setState({
        phase: 'done', runId: data.run_id!,
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
              <input type="checkbox" checked={allActiveSelected} onChange={toggleAll}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              Select / deselect all
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {databases.map((db) => (
              <div key={db.id} className="relative"
                onMouseEnter={() => !db.active && setHoveredDb(db.id)}
                onMouseLeave={() => setHoveredDb(null)}
              >
                <label className={`flex items-start gap-3 p-4 border rounded-lg transition-all cursor-pointer ${
                  db.active
                    ? selectedDbs.has(db.id) ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    : 'border-slate-200 bg-slate-50 opacity-40 cursor-not-allowed'
                }`}>
                  <input type="checkbox" checked={selectedDbs.has(db.id)} onChange={() => toggleDb(db.id)}
                    disabled={!db.active}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
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
              <input type="date" value={fromDate} max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              <div className="text-sm text-slate-500 mt-1">{formatDateDE(fromDate)}</div>
            </div>
            <div className="text-slate-400 mt-8">→</div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">To</label>
              <input type="date" value={toDate} min={fromDate}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
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
          <div className="space-y-3">
            {genericTerms.map((term, idx) => (
              <TermRow key={idx} value={term}
                onChange={(v) => setGenericTerms((prev) => prev.map((t, i) => i === idx ? v : t))}
                onRemove={() => setGenericTerms((prev) => prev.filter((_, i) => i !== idx))}
                showRemove={idx > 0}
                placeholder='"infusion pump" OR (infusion AND pump AND volumetric)' />
            ))}
          </div>
          <button type="button" onClick={() => setGenericTerms((prev) => [...prev, ''])}
            className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm">
            <Plus className="w-4 h-4" />
            Add another search combination
          </button>
        </section>

        {/* Manufacturer search terms */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Search Terms — Manufacturer &amp; Product Names</h2>
          <p className="text-sm text-slate-500 italic mb-6">
            Direct search by manufacturer name or specific product name
          </p>
          <div className="space-y-3">
            {manufacturerTerms.map((term, idx) => (
              <TermRow key={idx} value={term}
                onChange={(v) => setManufacturerTerms((prev) => prev.map((t, i) => i === idx ? v : t))}
                onRemove={() => setManufacturerTerms((prev) => prev.filter((_, i) => i !== idx))}
                showRemove={idx > 0}
                placeholder='"B. Braun" OR "BBraun" OR "Infusomat Space"' />
            ))}
          </div>
          <button type="button" onClick={() => setManufacturerTerms((prev) => [...prev, ''])}
            className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm">
            <Plus className="w-4 h-4" />
            Add another search combination
          </button>
        </section>

        {/* File upload */}
        <section className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Search Strategy Documents</h2>
          <input ref={fileInputRef} type="file" multiple
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <div
            className={clsx(
              'border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer',
              isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
            )}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-700 font-medium mb-1">Drop files here or browse</p>
            <p className="text-sm text-slate-500">PDF, DOCX, XLSX, PNG, JPG · Max 10 MB per file</p>
          </div>
          {uploadedFiles.length > 0 && (
            <ul className="mt-4 space-y-2">
              {uploadedFiles.map((f) => (
                <li key={f.key} className="flex items-center gap-3 text-sm">
                  {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                  {f.status === 'done'      && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />}
                  {f.status === 'error'     && <X className="w-4 h-4 text-red-500 shrink-0" />}
                  <span className={clsx('flex-1 truncate text-slate-700', f.status === 'error' && 'text-red-600')}>{f.name}</span>
                  {f.status !== 'uploading' && (
                    <button type="button"
                      onClick={() => setUploadedFiles((prev) => prev.filter((u) => u.key !== f.key))}
                      className="text-zinc-400 hover:text-red-500 transition-colors" aria-label="Remove file">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Action bar */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 flex-wrap gap-3">
          <button type="button" onClick={() => saveDraft()} disabled={draftSaving}
            className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {draftSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Draft
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={saveProfileAndDraft} disabled={draftSaving || noProfiles}
              className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed">
              Create Profile &amp; Save
            </button>
            <button type="button" onClick={runSearch}
              disabled={noProfiles || state.phase === 'running'}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
              {state.phase === 'running' ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Searching…</>
              ) : (
                <>Run Search <span>→</span></>
              )}
            </button>
          </div>
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
          {state.results.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 max-w-lg">
              <p className="text-sm font-medium text-zinc-700 mb-1">
                No FSNs published in BfArM during this period ({fromDate} to {toDate}).
              </p>
              <p className="text-xs text-zinc-500">
                BfArM does not publish daily. Try a wider date range — the last 14 days typically has 10–30 FSNs.
              </p>
            </div>
          ) : (
            <>
              {/* ── Summary + filter bar ── */}
              {(() => {
                const counts = {
                  all:           state.results.length,
                  relevant:      state.results.filter((r) => r.filter_decision?.decision === 'relevant').length,
                  uncertain:     state.results.filter((r) => r.filter_decision?.decision === 'uncertain').length,
                  excluded:      state.results.filter((r) => r.filter_decision?.decision === 'excluded').length,
                  filter_failed: state.results.filter((r) => r.filter_decision?.decision === 'filter_failed').length,
                }

                const sorted = [
                  ...state.results.filter((r) => r.filter_decision?.decision === 'relevant'),
                  ...state.results.filter((r) => r.filter_decision?.decision === 'uncertain'),
                  ...state.results.filter((r) => r.filter_decision?.decision === 'filter_failed'),
                  ...state.results.filter((r) => r.filter_decision?.decision === 'excluded'),
                  ...state.results.filter((r) => !r.filter_decision),
                ]

                const visible = filterTab === 'all'
                  ? sorted
                  : sorted.filter((r) => r.filter_decision?.decision === filterTab)

                const tabConfig: { key: FilterTab; label: string; activeClass: string }[] = [
                  { key: 'all',           label: `All (${counts.all})`,                  activeClass: 'border-zinc-900 text-zinc-900' },
                  { key: 'relevant',      label: `Relevant (${counts.relevant})`,         activeClass: 'border-green-600 text-green-700' },
                  { key: 'uncertain',     label: `Uncertain (${counts.uncertain})`,       activeClass: 'border-amber-500 text-amber-700' },
                  { key: 'excluded',      label: `Excluded (${counts.excluded})`,         activeClass: 'border-zinc-400 text-zinc-600' },
                  ...(counts.filter_failed > 0
                    ? [{ key: 'filter_failed' as FilterTab, label: `Failed (${counts.filter_failed})`, activeClass: 'border-red-600 text-red-700' }]
                    : []),
                ]

                return (
                  <>
                    <div className="flex items-center gap-4 mb-3 flex-wrap">
                      <p className="text-sm font-medium text-slate-700">
                        {state.results.length} notice{state.results.length !== 1 ? 's' : ''} found
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        {counts.relevant > 0 && (
                          <span className="flex items-center gap-1 text-green-700">
                            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                            {counts.relevant} relevant
                          </span>
                        )}
                        {counts.uncertain > 0 && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                            {counts.uncertain} uncertain
                          </span>
                        )}
                        {counts.excluded > 0 && (
                          <span className="flex items-center gap-1 text-zinc-500">
                            <span className="h-2 w-2 rounded-full bg-zinc-300 inline-block" />
                            {counts.excluded} excluded
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400 ml-auto">AI-filtered · {MODEL_LABEL}</span>
                    </div>

                    {/* Filter tabs */}
                    <div className="flex gap-1 border-b border-zinc-200 mb-4 flex-wrap">
                      {tabConfig.map((t) => (
                        <button key={t.key} onClick={() => setFilterTab(t.key)}
                          className={clsx(
                            'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                            filterTab === t.key ? t.activeClass : 'border-transparent text-zinc-500 hover:text-zinc-700'
                          )}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Report generation */}
                    <div className="flex items-center gap-3 mb-4">
                      {reportState.phase === 'idle' && (
                        <button onClick={() => generateReport(state.runId)}
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                          <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          Generate report
                        </button>
                      )}
                      {reportState.phase === 'generating' && (
                        <span className="flex items-center gap-2 text-sm text-zinc-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating PDF &amp; Excel…
                        </span>
                      )}
                      {reportState.phase === 'ready' && (
                        <>
                          {reportState.pdfStatus === 'generated' && reportState.pdfUrl ? (
                            <a href={reportState.pdfUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                              <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              Download PDF
                            </a>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {reportState.htmlUrl && (
                                <a href={reportState.htmlUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                                  <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                  Download HTML
                                </a>
                              )}
                              <p className="text-xs text-amber-700">
                                {reportState.pdfStatus === 'quota_exceeded'
                                  ? 'PDF generation temporarily unavailable this month. HTML available.'
                                  : 'PDF generation failed. HTML available as fallback.'}
                              </p>
                            </div>
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
                    {visible.length === 0 ? (
                      <p className="text-sm text-zinc-400 py-8 text-center">No results in this category.</p>
                    ) : (
                      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                        {visible.map((result) => (
                          <FsnRow
                            key={result.id}
                            result={result}
                            expanded={expandedIds.has(result.id)}
                            onToggle={() => toggleExpand(result.id)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

const MODEL_LABEL = 'claude-sonnet-4-6'
