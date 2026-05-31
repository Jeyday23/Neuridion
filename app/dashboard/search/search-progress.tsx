'use client'

import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { CheckCircle, Loader2, Square } from 'lucide-react'
import type { SearchProgress } from '../search-context'
import { fmtSourceDb } from '@/lib/domain/source-labels'

// ─── Progress tips ────────────────────────────────────────────────────────────

export const PROGRESS_TIPS = [
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

export function ElapsedTimer({ startedAt }: { startedAt: number }) {
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

export function RotatingTip() {
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

export function SearchProgressCard({ startedAt, progress, onCancel }: { startedAt: number; progress: SearchProgress | null; onCancel: () => void }) {
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
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[#0D9488] font-mono tabular-nums">
            <ElapsedTimer startedAt={startedAt} />
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-red-300 hover:text-white hover:bg-red-600/30 transition-colors"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        </div>
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
              const allScrapingDone = progress.sources_done.length >= progress.sources_total.length
              const isActive = !isDone && !allScrapingDone
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
                    {fmtSourceDb(sourceId)}
                  </span>
                  {isActive && (
                    <span className="text-xs text-teal-600 font-medium ml-auto">scanning…</span>
                  )}
                </div>
              )
            })}

            {/* AI filter phase — all sources done */}
            {progress.sources_done.length >= progress.sources_total.length && (
              <div className="flex items-center gap-2.5 pt-1">
                <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm text-[#0F1F3D] font-medium">Running AI relevance filter…</span>
                  {progress.filter_progress && (
                    <span className="text-xs text-teal-600">
                      {progress.filter_progress.done}/{progress.filter_progress.total} analyzed
                      {progress.filter_progress.cached > 0 && ` (${progress.filter_progress.cached} cached)`}
                    </span>
                  )}
                </div>
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
