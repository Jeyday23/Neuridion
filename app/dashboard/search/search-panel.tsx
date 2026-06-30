'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchContext, type SearchProgress, type FsnResult } from '../search-context'
import { useLanguage } from '../language-context'
import { format, subMonths } from 'date-fns'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'
import { FeedbackPopup } from '@/app/components/FeedbackPopup'
import { useToast } from '@/app/components/ui/ToastProvider'
import { apiFetch } from '@/lib/fetch'
import { motion } from 'framer-motion'
import { daysBetween } from '@/lib/utils/date-chunks'
import { SearchProgressCard } from './search-progress'
import { FsnRow } from './search-results'
import { ProfilePreviewCard } from './profile-preview'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  device_name: string
  manufacturer: string
  intended_use: string | null
  emdn_code: string | null
  device_class: string | null
  search_strategy: {
    competitor_terms?: Array<{ name: string; manufacturer?: string }>
    strategy_doc_paths?: string[]
  } | null
}

type FilterTab = 'all' | 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'

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


const WARNING_REPLACEMENTS: [RegExp, string | null][] = [
  [/FIRECRAWL_API_KEY/i, 'BfArM extended scraping is not currently available.'],
  [/API_KEY.*not set|not set.*API_KEY/i, null],
  [/items? dropped.*unparseable/i, 'Some results could not be processed due to date formatting issues.'],
  [/\d+ item cap reached/i, 'Results were capped to prevent overload — consider narrowing your search period.'],
]

const SAFE_PASSTHROUGH = /database was unavailable|returned no results|returned 0/i

function sanitizeErrorMessage(raw: string | null): string {
  if (!raw) return 'Search failed. Please try again or contact support.'
  const lines = raw.split('\n').map(line => {
    for (const [pattern, replacement] of WARNING_REPLACEMENTS) {
      if (pattern.test(line)) return replacement
    }
    if (SAFE_PASSTHROUGH.test(line)) return line
    return null
  }).filter(Boolean)
  return lines.length > 0
    ? lines.join(' ')
    : 'Search encountered issues. Check the Archive page for any partial results.'
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SearchPanel({ profiles }: { profiles: Profile[] }) {
  const today   = format(new Date(), 'yyyy-MM-dd')
  const yearAgo = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

  const { searchState: state, setSearchState: setState } = useSearchContext()
  const { t } = useLanguage()

  const STORAGE_KEY = 'neuridion-search-form'

  function loadSaved() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as {
        profileId?: string
        fromDate?: string
        toDate?: string
        selectedDbs?: string[]
      }
    } catch { return null }
  }

  const saved = useMemo(() => loadSaved(), [])

  const [profileId, setProfileId]     = useState(saved?.profileId && profiles.some(p => p.id === saved.profileId) ? saved.profileId : profiles[0]?.id ?? '')
  const [fromDate, setFromDate]       = useState(saved?.fromDate ?? yearAgo)
  const [toDate, setToDate]           = useState(saved?.toDate ?? today)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab]     = useState<FilterTab>('all')
  const [draftId, setDraftId]         = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(
    saved?.selectedDbs ? new Set(saved.selectedDbs) : new Set(databases.filter(d => d.active).map(d => d.id))
  )

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      profileId, fromDate, toDate, selectedDbs: [...selectedDbs],
    }))
  }, [profileId, fromDate, toDate, selectedDbs])
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
      const timer = setTimeout(() => setShowFeedback(true), 5000)
      return () => clearTimeout(timer)
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
      }
      const res  = await apiFetch('/api/search-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) {
        if (res.status === 429) {
          showToast(data.error || 'Too many requests — please wait a moment.', 'error')
          return
        }
        throw new Error(data.error ?? 'Save failed')
      }
      if (data.id) setDraftId(data.id)
      sessionStorage.removeItem(STORAGE_KEY)
      showToast(successMsg)
    } catch (err) {
      showToast('Unable to save draft. Please try again.', 'error')
    } finally {
      setDraftSaving(false)
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
          source_breakdown: SearchProgress['source_breakdown'] | null
          error_message:    string | null
        }
        if (data.status === 'cancelled') {
          stopPolling()
          setState({ phase: 'idle' })
        } else if (data.status === 'pending' || data.status === 'running') {
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
            sourceBreakdown: data.source_breakdown ?? null,
            startedAt,
            degraded:       data.status === 'degraded',
          })
        } else {
          stopPolling()
          setState({ phase: 'error', message: sanitizeErrorMessage(data.error_message) })
        }
      } catch {
        // Network blip — keep polling, transient errors resolve
      }
    }, 3000)

    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setState({ phase: 'error', message: 'Search is taking longer than expected. It is still running in the background — check the Archive page for results.' })
    }, 15 * 60 * 1000)
  }

  async function cancelSearch() {
    const runId = state.phase === 'running' ? state.runId : state.phase === 'queued' ? state.runId : null
    stopPolling()
    setState({ phase: 'idle' })
    if (runId) {
      try {
        await apiFetch(`/api/search-runs/${runId}/cancel`, { method: 'POST' })
      } catch { /* best-effort */ }
    }
  }

  async function runSearch() {
    if (!profileId || submittingRef.current || selectedDbs.size === 0) return
    submittingRef.current = true
    setExpandedIds(new Set())
    setFilterTab('all')

    const startedAt = Date.now()

    try {
      const res = await apiFetch('/api/search-runs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
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
          const body = await res.json().catch(() => null)
          const msg = body?.error || 'Too many requests — please wait a moment and try again.'
          setState({ phase: 'error', message: msg })
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
      sessionStorage.removeItem(STORAGE_KEY)
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
        <h1 className="text-xl font-bold text-[#0F1F3D] mb-2">{t.search.pageTitle}</h1>
        <p className="text-[#134E4A]">{t.search.pageSubtitle}</p>
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
            <>
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}
                className="w-full max-w-md rounded border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#134E4A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent">
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.device_name} — {p.manufacturer}</option>
                ))}
              </select>
              {(() => {
                const selected = profiles.find(p => p.id === profileId)
                return selected ? <ProfilePreviewCard profile={selected} /> : null
              })()}
            </>
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
          <button type="button" onClick={() => saveDraft()} disabled={noProfiles || draftSaving}
            className="px-6 py-3 border border-[#E2E8F0] text-[#134E4A] rounded hover:border-[#0D9488] hover:text-[#0D9488] transition-colors font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {draftSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.search.saveDraft}
          </button>
          <button type="button" onClick={runSearch} disabled={noProfiles || state.phase === 'running' || state.phase === 'queued' || isOverLimit || selectedDbs.size === 0}
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
          onCancel={cancelSearch}
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
                    <div className="mb-4 rounded border border-[rgba(13,148,136,0.2)] bg-[rgba(13,148,136,0.06)] px-4 py-3 flex items-center justify-between">
                      <p className="text-sm text-[#134E4A]">
                        <span className="font-medium">{t.search.nextStep}</span> {t.search.nextStepBanner}
                      </p>
                      <a
                        href={`/dashboard/archive/${state.runId}`}
                        className="shrink-0 rounded border border-[#0D9488] bg-[#0D9488] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E] transition-colors"
                      >
                        {t.search.reviewApprove}
                      </a>
                    </div>

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
                          {state.preFilterCount ?? state.totalScraped} raw source result{(state.preFilterCount ?? state.totalScraped) !== 1 ? 's' : ''}
                          {` → ${counts.relevant + counts.uncertain + counts.excluded} AI-assessed`}
                          {counts.filter_failed > 0 && ` · ${counts.filter_failed} unfiltered`}
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

                    {/* Report generation is only available after review in the Archive */}

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

const MODEL_LABEL = 'AI-assisted'
