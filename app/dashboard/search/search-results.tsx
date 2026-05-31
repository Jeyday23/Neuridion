'use client'

import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import { fmtSourceDb } from '@/lib/domain/source-labels'

// ─── Types ───────────────────────────────────────────────────────────────────

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

function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

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

export function FsnRow({
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
              {fmtSourceDb(result.source)}
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
              {d?.confidence != null && <span title="How certain the AI is that this classification is correct">Confidence: {Math.round(d.confidence * 100)}%</span>}
              {d?.model && <span>{formatModelLabel(d.model)}</span>}
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

function formatModelLabel(model: string | null | undefined): string {
  if (!model) return 'AI-assisted'
  const MODEL_NAMES: Record<string, string> = {
    'claude-sonnet-4-5': 'Sonnet 4.5',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-haiku-4-5':  'Haiku 4.5',
  }
  return MODEL_NAMES[model] ?? model
}
