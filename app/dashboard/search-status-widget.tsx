'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useSearchContext } from './search-context'
import { useLanguage } from './language-context'

const PHASE_THRESHOLDS = [0, 6, 18, 35, 55]

function getPhase(elapsed: number, phases: readonly string[]): string {
  let idx = 0
  for (let i = 0; i < PHASE_THRESHOLDS.length; i++) {
    if (elapsed >= PHASE_THRESHOLDS[i]) idx = i
  }
  return phases[Math.min(idx, phases.length - 1)]
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return m > 0 ? `${m}:${String(ss).padStart(2, '0')}` : `${ss}s`
}

export function SearchStatusWidget() {
  const { searchState, setSearchState } = useSearchContext()
  const { t } = useLanguage()
  const router = useRouter()
  const [elapsed, setElapsed] = useState(0)

  // Tick every second while running
  useEffect(() => {
    if (searchState.phase !== 'running') { setElapsed(0); return }
    const start = searchState.startedAt
    const id = setInterval(() => setElapsed(Date.now() - start), 500)
    return () => clearInterval(id)
  }, [searchState.phase, searchState.phase === 'running' ? searchState.startedAt : null])

  if (searchState.phase === 'idle') return null

  const elapsedOnDone =
    searchState.phase === 'done'
      ? Math.floor((Date.now() - searchState.startedAt) / 1000)
      : null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" style={{ pointerEvents: 'none' }}>
      <div
        className="rounded-md border border-[#E2E8F0] bg-white shadow-md px-4 py-3 flex items-start gap-3 w-72"
        style={{ pointerEvents: 'auto' }}
      >

        {/* ── RUNNING ── */}
        {searchState.phase === 'running' && (
          <>
            <span className="relative flex h-4 w-4 mt-0.5 shrink-0 items-center justify-center">
              <span className="animate-ping absolute h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">{t.widget.running}</p>
                <span className="text-xs font-mono text-zinc-400 tabular-nums">{fmtElapsed(elapsed)}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                {getPhase(Math.floor(elapsed / 1000), t.phases)}
              </p>
              {/* Progress bar */}
              <div className="mt-2 h-1 w-full rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(95, Math.floor(elapsed / 1000) * 1.5)}%` }}
                />
              </div>
            </div>
          </>
        )}

        {/* ── DONE ── */}
        {searchState.phase === 'done' && (
          <>
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">{t.widget.done}</p>
                {elapsedOnDone != null && (
                  <span className="text-xs text-zinc-400 tabular-nums">{fmtElapsed(elapsedOnDone * 1000)}</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                <span className="text-green-600 font-medium">{searchState.counts.relevant} {t.tabs.relevant.toLowerCase()}</span>
                {searchState.counts.uncertain > 0 && (
                  <> · <span className="text-amber-600 font-medium">{searchState.counts.uncertain} {t.tabs.uncertain.toLowerCase()}</span></>
                )}
                {' '}· {searchState.results.length} {t.widget.total}
              </p>
              <div className="flex gap-3 mt-1.5">
                <button
                  onClick={() => router.push(`/dashboard/archive/${searchState.runId}`)}
                  className="text-xs font-semibold text-[#0D9488] hover:text-[#0F766E] underline underline-offset-2"
                >
                  {t.widget.reviewResults}
                </button>
                <button
                  onClick={() => router.push('/dashboard/search')}
                  className="text-xs text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
                >
                  {t.widget.viewResults}
                </button>
              </div>
            </div>
            <button
              onClick={() => setSearchState({ phase: 'idle' })}
              className="text-zinc-300 hover:text-zinc-500 shrink-0"
              aria-label="Dismiss"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ── ERROR ── */}
        {searchState.phase === 'error' && (
          <>
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{t.widget.failed}</p>
              <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{searchState.message}</p>
            </div>
            <button
              onClick={() => setSearchState({ phase: 'idle' })}
              className="text-zinc-300 hover:text-zinc-500 shrink-0"
              aria-label="Dismiss"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}

      </div>
    </div>
  )
}
