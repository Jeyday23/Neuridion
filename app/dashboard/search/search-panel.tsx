'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchContext, type SearchProgress } from '../search-context'
import { useLanguage } from '../language-context'
import { format, subMonths } from 'date-fns'
import { clsx } from 'clsx'
import { Upload, X, CheckCircle, Loader2, ChevronDown } from 'lucide-react'
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'
import { createClient } from '@/lib/supabase/client'
import { FeedbackPopup } from '@/app/components/FeedbackPopup'
import { useToast } from '@/app/components/ui/ToastProvider'
import { apiFetch } from '@/lib/fetch'
import { motion } from 'framer-motion'
import { daysBetween } from '@/lib/utils/date-chunks'

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

function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

// ─── Source label formatter ───────────────────────────────────────────────────

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

// ─── Database list ────────────────────────────────────────────────────────────

const databases = [
  { id: 'bfarm',        name: 'BfArM Database',               region: 'Germany',      active: true  },
  { id: 'fda',          name: 'FDA MAUDE',                    region: 'USA',          active: true  },
  { id: 'swissmedic',   name: 'Swissmedic',                   region: 'Switzerland',  active: true  },
  { id: 'eudamed',      name: 'EUDAMED',                      region: 'EU',           active: false },
  { id: 'mhra',         name: 'MHRA - Medical Device Alerts', region: 'UK',           active: true  },
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

const PANEL_STYLES: Record<string, string> = {
  relevant:      'bg-green-50 border-green-200',
  uncertain:     'bg-amber-50 border-amber-200',
  excluded:      'bg-zinc-50 border-zinc-200',
  filter_failed: 'bg-red-50 border-red-200',
}

// ─── FSN Row ──────────────────────────────────────────────────────────────────

function FsnRow({
  result, expanded, onToggle, badgeLabels,
}: {
  result: FsnResult
  expanded: boolean
  onToggle: () => void
  badgeLabels: Record<string, string>
}) {
  const d = result.filter_decision
  const dotColor = d ? (DOT_COLORS[d.decision] ?? '#9ca3af') : '#9ca3af'

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-zinc-50 transition-colors"
        onClick={onToggle}
      >
        <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <a href={safeHref(result.source_url)} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-zinc-900 hover:text-[#0D9488] hover:underline line-clamp-2">
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
                <span>{new Date(result.fsn_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              )}
            </div>
            {d && (
              <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[d.decision] ?? ''}`}>
                {badgeLabels[d.decision] ?? d.decision}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={clsx('w-4 h-4 text-zinc-400 shrink-0 mt-1 transition-transform duration-150', expanded && 'rotate-180')} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 ml-5">
          <div className={clsx('rounded border p-3 text-sm', d ? PANEL_STYLES[d.decision] : 'bg-zinc-50 border-zinc-200')}>
            {!d && <p className="text-xs text-zinc-500 italic">No AI assessment available for this item.</p>}
            {d?.decision === 'filter_failed' && (
              <p className="text-xs font-medium text-amber-700">Not reviewed — manual review required.</p>
            )}
            {d && d.decision !== 'filter_failed' && (
              <>
                <p className="text-xs font-semibold text-zinc-600 mb-1">AI Assessment</p>
                <p className="text-xs text-zinc-700 leading-relaxed">{d.rationale}</p>
              </>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
              {d?.confidence != null && <span>Confidence: {Math.round(d.confidence * 100)}%</span>}
              {d?.model && <span>Model: {d.model}</span>}
              <a href={safeHref(result.source_url)} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[#0D9488] hover:underline text-xs">
                View source ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Progress tips ────────────────────────────────────────────────────────────

const PROGRESS_TIPS = [
  'Scanning Field Safety Notices issued in your selected period',
  'Cross-referencing manufacturer aliases and trade name variants',
  'Applying 2-stage AI relevance filter using Claude Sonnet',
  'Checking EU MDR compliance signals across regulatory databases',
  'Deduplicating FSN records to prevent double-counting across sources',
  'Comparing notices against your device EMDN classification',
  'Identifying Field Safety Corrective Actions relevant to your profile',
  'Filtering by manufacturer name variants and legal entity suffixes',
]

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000))
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <span>{m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`}</span>
}

// ─── Rotating tip ─────────────────────────────────────────────────────────────

function RotatingTip() {
  const [idx, setIdx]         = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setVisible(false), 4000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => { setIdx((i) => (i + 1) % PROGRESS_TIPS.length); setVisible(true) }, 300)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <p className="text-xs text-[#0D9488] italic transition-opacity duration-300" style={{ opacity: visible ? 1 : 0 }}>
      {PROGRESS_TIPS[idx]}
    </p>
  )
}

// ─── Search progress card ─────────────────────────────────────────────────────

function SearchProgressCard({ startedAt, progress }: { startedAt: number; progress: SearchProgress | null }) {
  return (
    <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-[#0F1F3D] to-[#0a2e2b] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
          </span>
          <span className="text-sm font-medium text-white truncate">Searching databases…</span>
        </div>
        <span className="text-xs text-[#0D9488] font-mono tabular-nums shrink-0">
          <ElapsedTimer startedAt={startedAt} />
        </span>
      </div>

      {/* Indeterminate progress bar */}
      <div className="h-0.5 bg-[#CCFBF1] overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-[#0D9488] to-[#14b8a6] animate-[slide_2s_ease-in-out_infinite]" />
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {progress && progress.sources_total.length > 0 ? (
          <div className="space-y-2">
            {progress.sources_total.map((sourceId) => {
              const isDone   = progress.sources_done.includes(sourceId)
              const isActive = progress.current_source === sourceId
              return (
                <div key={sourceId} className="flex items-center gap-2.5">
                  {isDone  && <CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />}
                  {isActive && <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />}
                  {!isDone && !isActive && (
                    <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </span>
                  )}
                  <span className={clsx(
                    'text-sm',
                    isDone    ? 'text-[#0F766E]'
                    : isActive ? 'text-[#0F1F3D] font-medium'
                    :            'text-[#0D9488]'
                  )}>
                    {formatSourceLabel(sourceId)}
                  </span>
                  {isActive && (
                    <span className="text-xs text-teal-600 font-medium ml-auto">scanning…</span>
                  )}
                </div>
              )
            })}

            {/* AI filter phase — all sources done, current_source is null */}
            {progress.current_source === null && progress.sources_done.length > 0 && (
              <div className="flex items-center gap-2.5 pt-1">
                <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
                <span className="text-sm text-[#0F1F3D] font-medium">Running AI relevance filter…</span>
              </div>
            )}

            {progress.items_found > 0 && (
              <p className="text-xs text-[#0D9488] pt-1 border-t border-[#CCFBF1]">
                {progress.items_found} item{progress.items_found !== 1 ? 's' : ''} found so far
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[#0F766E]">
            <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
            <span>{progress ? 'Running AI relevance filter…' : 'Starting search…'}</span>
          </div>
        )}

        {/* Rotating tip */}
        <div className="flex items-start gap-2 pt-1 border-t border-[#CCFBF1]">
          <svg className="w-3.5 h-3.5 text-[#0D9488] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <RotatingTip />
        </div>
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SearchPanel({ profiles }: { profiles: Profile[] }) {
  const today   = format(new Date(), 'yyyy-MM-dd')
  const yearAgo = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

  const { searchState: state, setSearchState: setState } = useSearchContext()
  const { t } = useLanguage()

  const [profileId, setProfileId]     = useState(profiles[0]?.id ?? '')
  const [fromDate, setFromDate]       = useState(yearAgo)
  const [toDate, setToDate]           = useState(today)
  const [reportState, setReportState] = useState<ReportState>({ phase: 'idle' })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab]     = useState<FilterTab>('all')
  const [draftId, setDraftId]         = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging]   = useState(false)
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(new Set(databases.filter(d => d.active).map(d => d.id)))
  const [hoveredDb, setHoveredDb]     = useState<string | null>(null)

  const [showFeedback, setShowFeedback] = useState(false)
  const totalDays = useMemo(
    () => (fromDate && toDate ? daysBetween(fromDate, toDate) : 0),
    [fromDate, toDate],
  )

  const MAX_DAYS = 365 * 3 + 1  // 3 years = 1096 days

  const isMediumSearch = totalDays > 90  && totalDays <= 366
  const isLongSearch   = totalDays > 366 && totalDays <= MAX_DAYS
  const isOverLimit    = totalDays > MAX_DAYS

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const submittingRef  = useRef(false)
  // Scroll target for "View results" navigation
  const resultsRef  = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)

  // Auto-scroll to results when they arrive (initial run or navigate-back)
  useEffect(() => {
    if (state.phase === 'done') {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [state.phase])

  // Feedback popup: show after every completed search (7-day dismiss cooldown)
  useEffect(() => {
    if (state.phase !== 'done') return
    if (state.results.length === 0) return
    const dismissedUntil = parseInt(localStorage.getItem('neuridion-feedback-dismissed-until') ?? '0')
    if (Date.now() > dismissedUntil) {
      setTimeout(() => setShowFeedback(true), 5000)
    }
  }, [state.phase])

  // Clear polling refs on unmount — prevents state updates after navigation
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current)  clearTimeout(timeoutRef.current)
    }
  }, [])

  const activeDbs = databases.filter((d) => d.active)
  const allActiveSelected = activeDbs.every((d) => selectedDbs.has(d.id))

  // Build badge labels from translations
  const badgeLabels: Record<string, string> = {
    relevant:      t.badges.relevant,
    uncertain:     t.badges.uncertain,
    excluded:      t.badges.excluded,
    filter_failed: t.badges.filter_failed,
  }

  const { show: showToast } = useToast()

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
        id: draftId ?? undefined,
        profile_id: profileId || null,
        from: fromDate, to: toDate,
        dbs: [...selectedDbs],
        uploadedPaths: uploadedFiles.filter((f) => f.status === 'done').map((f) => f.path),
      }
      const res  = await apiFetch('/api/search-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) {
        if (res.status === 429) { showToast('Too many requests — please wait a moment.', 'error'); return }
        throw new Error(data.error ?? 'Save failed')
      }
      if (data.id) setDraftId(data.id)
      showToast(successMsg)
    } catch (err) {
      showToast('Unable to save draft. Please try again.', 'error')
    } finally {
      setDraftSaving(false)
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const sb = createClient()
    const { data: { user: authUser } } = await sb.auth.getUser()
    if (!authUser) { showToast('Please sign in to upload files', 'error'); return }

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} exceeds 10 MB limit`, 'error'); continue }
      const key  = `${Date.now()}_${Math.random().toString(36).slice(2)}`
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${authUser.id}/${key}_${safe}`
      setUploadedFiles((prev) => [...prev, { key, name: file.name, path, status: 'uploading' }])
      try {
        const { error } = await sb.storage.from('search-attachments').upload(path, file)
        setUploadedFiles((prev) => prev.map((f) => f.key === key ? { ...f, status: error ? 'error' : 'done' } : f))
        if (error) showToast(`Upload failed: ${file.name}`, 'error')
      } catch {
        setUploadedFiles((prev) => prev.map((f) => f.key === key ? { ...f, status: 'error' } : f))
        showToast(`Upload failed: ${file.name}`, 'error')
      }
    }
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave() { setIsDragging(false) }
  function onDrop(e: React.DragEvent) { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files) }

  async function generateReport(runId: string) {
    setReportState({ phase: 'generating' })
    try {
      const res  = await apiFetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: runId }) })
      const data = await res.json() as { pdf_url?: string | null; html_url?: string | null; excel_url?: string | null; pdf_status?: 'generated' | 'quota_exceeded' | 'failed'; error?: string }
      if (!res.ok) {
        if (res.status === 429) { setReportState({ phase: 'error', message: 'Too many requests — please wait a moment.' }); return }
        setReportState({ phase: 'error', message: data.error ?? 'Report generation failed.' })
        return
      }
      setReportState({ phase: 'ready', pdfUrl: data.pdf_url ?? null, htmlUrl: data.html_url ?? null, excelUrl: data.excel_url ?? null, pdfStatus: data.pdf_status ?? 'failed' })
    } catch (err) {
      setReportState({ phase: 'error', message: 'Report generation failed. Please try again.' })
    }
  }

  function stopPolling() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (timeoutRef.current)  { clearTimeout(timeoutRef.current);   timeoutRef.current  = null }
  }

  function startPolling(runId: string, startedAt: number) {
    intervalRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/search-runs/${runId}`)
        if (!res.ok) {
          stopPolling()
          const msg =
            res.status === 401 ? 'Your session expired. Please refresh the page.' :
            `Error ${res.status} — please try again.`
          setState({ phase: 'error', message: msg })
          return
        }
        const data = await res.json() as {
          status:           string
          progress:         SearchProgress | null
          results:          FsnResult[]
          relevant_count:   number
          uncertain_count:  number
          excluded_count:   number
          total_scraped:    number | null
          pre_filter_count: number | null
          error_message:    string | null
        }
        if (data.status === 'pending' || data.status === 'running') {
          setState({ phase: 'running', runId, startedAt, progress: data.progress ?? null })
        } else if (data.status === 'complete' || data.status === 'degraded') {
          stopPolling()
          setState({
            phase:          'done',
            runId,
            results:        data.results,
            counts:         { relevant: data.relevant_count, uncertain: data.uncertain_count, excluded: data.excluded_count },
            totalScraped:   data.total_scraped,
            preFilterCount: data.pre_filter_count,
            startedAt,
            degraded:       data.status === 'degraded',
          })
        } else {
          stopPolling()
          setState({ phase: 'error', message: data.error_message ?? 'Search failed.' })
        }
      } catch {
        // Network blip — keep polling, transient errors resolve
      }
    }, 3000)

    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setState({ phase: 'error', message: 'Search is taking longer than expected. Check the Archive page for results once complete.' })
    }, 20 * 60 * 1000)
  }

  async function runSearch() {
    if (!profileId || submittingRef.current) return
    submittingRef.current = true
    setReportState({ phase: 'idle' })
    setExpandedIds(new Set())
    setFilterTab('all')

    const startedAt = Date.now()

    try {
      const res = await fetch('/api/search-runs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-protection': '1' },
        body:    JSON.stringify({
          profile_id:   profileId,
          period_from:  fromDate,
          period_to:    toDate,
          selected_dbs: [...selectedDbs],
        }),
      })

      if (!res.ok) {
        // 524/504 = Cloudflare/proxy timeout — body is HTML, not JSON
        if (res.status === 524 || res.status === 504 || res.status === 408) {
          setState({ phase: 'error', message: 'The search timed out. Try a shorter date range or fewer databases.' })
          return
        }
        if (res.status === 429) {
          setState({ phase: 'error', message: 'Too many requests — please wait a moment and try again.' })
          return
        }
        let errMsg = `Search failed (HTTP ${res.status}).`
        try {
          const errData = await res.json() as { error?: string }
          if (errData.error) errMsg = errData.error
        } catch { /* body may not be JSON */ }
        setState({ phase: 'error', message: errMsg })
        return
      }

      const { run_id } = await res.json() as { run_id: string; status: string }
      setState({ phase: 'queued', runId: run_id, startedAt })
      startPolling(run_id, startedAt)
    } catch (err) {
      setState({ phase: 'error', message: err instanceof TypeError ? 'Network error — check your connection and try again.' : 'Something went wrong. Please try again.' })
    } finally {
      submittingRef.current = false
    }
  }

  const noProfiles = profiles.length === 0

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-10 h-10 bg-[#0D9488] text-white rounded-md flex items-center justify-center font-medium text-lg">1</div>
          <h1 className="text-xl font-bold text-[#0F1F3D]">{t.search.pageTitle}</h1>
        </div>
        <p className="text-[#134E4A] ml-14">{t.search.pageSubtitle}</p>
      </div>

      <div className="space-y-8">
        {/* Profile selector */}
        <section className="bg-white rounded-md border border-[#E2E8F0] p-8">
          <h2 className="text-xl font-semibold text-[#0F1F3D] mb-6">
            {t.search.productProfile} <span className="text-red-500">*</span>
          </h2>
          {noProfiles ? (
            <p className="text-sm text-[#0F766E]">
              {t.search.noProfiles} —{' '}
              <a href="/dashboard/profiles/new" className="text-[#0D9488] hover:underline">{t.search.createFirst}</a>
            </p>
          ) : (
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}
              className="w-full max-w-md rounded border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#134E4A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.device_name} — {p.manufacturer}</option>
              ))}
            </select>
          )}
        </section>

        {/* Databases */}
        <section className="bg-white rounded-md border border-[#E2E8F0] p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-[#0F1F3D]">
              {t.search.databases} ({selectedDbs.size} {t.search.selected}) <span className="text-red-500">*</span>
              <InfoTooltip text="Select which regulatory databases to search. BfArM (Germany), MHRA (UK), FDA MAUDE (USA), Swissmedic (Switzerland). Inactive databases are coming soon." />
            </h2>
            <label className="flex items-center gap-2 text-sm text-[#134E4A] cursor-pointer hover:text-[#0F1F3D]">
              <input type="checkbox" checked={allActiveSelected} onChange={toggleAll}
                className="w-4 h-4 rounded border-slate-300 text-[#0D9488] focus:ring-[#0D9488]" />
              {t.search.selectDeselectAll}
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {databases.map((db) => (
              <div key={db.id} className="relative"
                onMouseEnter={() => !db.active && setHoveredDb(db.id)}
                onMouseLeave={() => setHoveredDb(null)}>
                <label className={`flex items-start gap-3 p-4 border rounded transition-all cursor-pointer ${
                  db.active
                    ? selectedDbs.has(db.id) ? 'border-[#0D9488] bg-[rgba(13,148,136,0.06)]' : 'border-[#E2E8F0] hover:border-[#0D9488]'
                    : 'border-[#E2E8F0] bg-zinc-50 opacity-40 cursor-not-allowed'
                }`}>
                  <input type="checkbox" checked={selectedDbs.has(db.id)} onChange={() => toggleDb(db.id)} disabled={!db.active}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-[#0D9488] focus:ring-[#0D9488] disabled:opacity-50" />
                  <div className="flex-1">
                    <div className="font-semibold text-[#0F1F3D] text-sm">{db.name}</div>
                    <div className="text-xs text-[#0F766E]">{db.region}</div>
                  </div>
                </label>
                {!db.active && hoveredDb === db.id && (
                  <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-[#0F1F3D] text-white text-sm rounded shadow-lg z-10 whitespace-nowrap">
                    Coming soon
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-[#0F1F3D] rotate-45" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Search period */}
        <section className="bg-white rounded-md border border-[#E2E8F0] p-8">
          <h2 className="text-xl font-semibold text-[#0F1F3D] mb-6">
            {t.search.searchPeriod} <span className="text-red-500">*</span>
          </h2>
          <div className="flex items-center gap-6 max-w-xl">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#134E4A] mb-2">{t.search.from}</label>
              <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-3 border border-[#E2E8F0] rounded focus:ring-2 focus:ring-[#0D9488] focus:border-transparent" />
              <div className="text-sm text-[#0F766E] mt-1">{formatDateDE(fromDate)}</div>
            </div>
            <div className="text-[#0D9488] mt-8">→</div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#134E4A] mb-2">{t.search.to}</label>
              <input type="date" value={toDate} min={fromDate} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setToDate(e.target.value)}
                className="w-full px-4 py-3 border border-[#E2E8F0] rounded focus:ring-2 focus:ring-[#0D9488] focus:border-transparent" />
              <div className="text-sm text-[#0F766E] mt-1">{formatDateDE(toDate)}</div>
            </div>
          </div>
        </section>

        {/* File upload */}
        <section className="bg-white rounded-md border border-[#E2E8F0] p-8">
          <h2 className="text-xl font-semibold text-[#0F1F3D] mb-6">{t.search.strategyDocs}</h2>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <div className={clsx('border-2 border-dashed rounded p-12 text-center transition-colors cursor-pointer',
            isDragging ? 'border-[#0D9488] bg-[rgba(13,148,136,0.06)]' : 'border-slate-300 hover:border-[#0D9488] hover:bg-[rgba(13,148,136,0.06)]')}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-12 h-12 text-[#0D9488] mx-auto mb-4" />
            <p className="text-[#134E4A] font-medium mb-1">{t.search.dropFiles}</p>
            <p className="text-sm text-[#0F766E]">{t.search.dropFilesHint}</p>
          </div>
          {uploadedFiles.length > 0 && (
            <ul className="mt-4 space-y-2">
              {uploadedFiles.map((f) => (
                <li key={f.key} className="flex items-center gap-3 text-sm">
                  {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                  {f.status === 'done'      && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />}
                  {f.status === 'error'     && <X className="w-4 h-4 text-red-500 shrink-0" />}
                  <span className={clsx('flex-1 truncate text-[#134E4A]', f.status === 'error' && 'text-red-600')}>{f.name}</span>
                  {f.status !== 'uploading' && (
                    <button type="button" onClick={() => setUploadedFiles((prev) => prev.filter((u) => u.key !== f.key))}
                      className="text-zinc-400 hover:text-red-500 transition-colors" aria-label="Remove file">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Date range warnings */}
        {isOverLimit && (
          <div className="rounded border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] p-4">
            <p className="text-sm text-[#DC2626] font-semibold">
              Maximum range: 3 years. BfArM provides direct year-archive access for the
              current year, last year, and year before last. For deeper history, contact us.
            </p>
          </div>
        )}
        {isLongSearch && (
          <div className="rounded border border-[rgba(217,119,6,0.2)] bg-[rgba(217,119,6,0.08)] p-4">
            <p className="text-sm text-[#D97706]">
              <strong>Multi-year search:</strong> ~{totalDays} days
              (~{Math.round(totalDays / 365)} years). Estimated time: 15–40 minutes.
              Do not close this tab.
            </p>
          </div>
        )}
        {isMediumSearch && (
          <div className="rounded border border-[rgba(217,119,6,0.2)] bg-[rgba(217,119,6,0.08)] p-4">
            <p className="text-sm text-[#D97706]">
              <strong>Long search:</strong> ~{totalDays} days. Estimated time: 5–15 minutes.
              Audit-grade accuracy via BfArM year archive.
            </p>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between pt-6 border-t border-[#E2E8F0] flex-wrap gap-3">
          <button type="button" onClick={() => saveDraft()} disabled={draftSaving}
            className="px-6 py-3 border border-[#E2E8F0] text-[#134E4A] rounded hover:border-[#0D9488] hover:text-[#0D9488] transition-colors font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {draftSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.search.saveDraft}
          </button>
          <button type="button" onClick={runSearch} disabled={noProfiles || state.phase === 'running' || state.phase === 'queued' || isOverLimit}
            className="px-8 py-3 bg-[#0D9488] text-white rounded hover:bg-[#0F766E] transition-colors font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {(state.phase === 'running' || state.phase === 'queued')
              ? <><Loader2 className="h-4 w-4 animate-spin" />{t.search.searching}</>
              : <>{t.search.runSearch} <span>→</span></>
            }
          </button>
        </div>
      </div>

      {/* Progress */}
      {(state.phase === 'running' || state.phase === 'queued') && (
        <SearchProgressCard
          startedAt={state.startedAt}
          progress={state.phase === 'running' ? state.progress : null}
        />
      )}

      {/* Error */}
      {state.phase === 'error' && (
        <div className="mt-8 rounded border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] px-4 py-3">
          <p className="text-sm text-[#DC2626]">{state.message}</p>
        </div>
      )}

      {/* ── Results ── */}
      {state.phase === 'done' && (
        <div ref={resultsRef} className="mt-8 scroll-mt-6">
          {state.degraded && (
            <div className="mb-4 rounded border border-[rgba(217,119,6,0.2)] bg-[rgba(217,119,6,0.08)] px-4 py-3">
              <p className="text-sm text-[#D97706]">Some databases returned partial results — results may be incomplete.</p>
            </div>
          )}
          {state.results.length === 0 ? (
            <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 max-w-lg">
              <p className="text-sm font-medium text-zinc-700 mb-1">{t.search.noResults}</p>
              <p className="text-xs text-zinc-500">{t.search.noResultsHint}</p>
            </div>
          ) : (
            <>
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
                const visible = filterTab === 'all' ? sorted : sorted.filter((r) => r.filter_decision?.decision === filterTab)

                const tabConfig: { key: FilterTab; label: string; activeClass: string }[] = [
                  { key: 'all',       label: `${t.tabs.all} (${counts.all})`,              activeClass: 'border-zinc-900 text-zinc-900' },
                  { key: 'relevant',  label: `${t.tabs.relevant} (${counts.relevant})`,    activeClass: 'border-green-600 text-green-700' },
                  { key: 'uncertain', label: `${t.tabs.uncertain} (${counts.uncertain})`,  activeClass: 'border-amber-500 text-amber-700' },
                  { key: 'excluded',  label: `${t.tabs.excluded} (${counts.excluded})`,    activeClass: 'border-zinc-400 text-zinc-600' },
                  ...(counts.filter_failed > 0
                    ? [{ key: 'filter_failed' as FilterTab, label: `${t.tabs.failed} (${counts.filter_failed})`, activeClass: 'border-red-600 text-red-700' }]
                    : []),
                ]

                return (
                  <>
                    {/* Summary bar */}
                    <div className="flex items-center gap-4 mb-3 flex-wrap">
                      <p className="text-sm font-medium text-[#134E4A]">
                        {state.results.length} {t.search.noticesFound.replace('{s}', state.results.length !== 1 ? 's' : '').replace('{en}', state.results.length !== 1 ? 'en' : '')}
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        {counts.relevant > 0 && (
                          <span className="flex items-center gap-1 text-green-700">
                            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                            {counts.relevant} {t.tabs.relevant.toLowerCase()}
                          </span>
                        )}
                        {counts.uncertain > 0 && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                            {counts.uncertain} {t.tabs.uncertain.toLowerCase()}
                          </span>
                        )}
                        {counts.excluded > 0 && (
                          <span className="flex items-center gap-1 text-zinc-500">
                            <span className="h-2 w-2 rounded-full bg-zinc-300 inline-block" />
                            {counts.excluded} {t.tabs.excluded.toLowerCase()}
                          </span>
                        )}
                      </div>
                      {state.totalScraped != null && (
                        <span className="text-xs text-zinc-400">
                          {state.totalScraped} scraped
                          {state.preFilterCount != null && ` → ${state.preFilterCount} filtered`}
                          {` → ${counts.all} classified`}
                        </span>
                      )}
                      <span className="text-xs text-zinc-400 ml-auto">AI-filtered · {MODEL_LABEL}</span>
                    </div>

                    {/* Filter tabs */}
                    <div className="flex gap-1 border-b border-zinc-200 mb-4 flex-wrap">
                      {tabConfig.map((tab) => (
                        <button key={tab.key} onClick={() => setFilterTab(tab.key)}
                          className={clsx('px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                            filterTab === tab.key ? tab.activeClass : 'border-transparent text-zinc-500 hover:text-zinc-700')}>
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Report generation */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      {reportState.phase === 'idle' && (
                        <button onClick={() => generateReport(state.runId)}
                          className="flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors">
                          <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          {t.search.generateReport}
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
                              className="flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors">
                              <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              {t.search.downloadPdf}
                            </a>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {reportState.htmlUrl && (
                                <a href={reportState.htmlUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors">
                                  <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                  {t.search.downloadHtml}
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
                              className="flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors">
                              <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75-.125V5.625m0 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75.125V5.625m0 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-9.75 0h9.75" />
                              </svg>
                              {t.search.downloadExcel}
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
                      <p className="text-sm text-zinc-400 py-8 text-center">{t.search.noCategory}</p>
                    ) : (
                      <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
                        {visible.map((result, idx) => (
                          <motion.div key={result.id}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.5), ease: 'easeOut' }}>
                            <FsnRow result={result}
                              expanded={expandedIds.has(result.id)}
                              onToggle={() => toggleExpand(result.id)}
                              badgeLabels={badgeLabels} />
                          </motion.div>
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

      {showFeedback && (
        <FeedbackPopup triggeredBy="first_search" onClose={() => setShowFeedback(false)} />
      )}
    </div>
  )
}

const MODEL_LABEL = 'Haiku + Sonnet'
