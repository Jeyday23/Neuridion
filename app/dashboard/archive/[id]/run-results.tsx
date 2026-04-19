'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

export interface FsnResult {
  id: string
  title: string
  manufacturer: string | null
  fsn_date: string | null
  source_url: string
  source_db: string
  filter_decision: {
    decision: 'relevant' | 'uncertain' | 'excluded'
    rationale: string
    confidence: number
  } | null
}

type Tab = 'all' | 'relevant' | 'uncertain' | 'excluded'

const DECISION_STYLES = {
  relevant:  'bg-green-50 text-green-700 border-green-200',
  uncertain: 'bg-amber-50 text-amber-700 border-amber-200',
  excluded:  'bg-zinc-100 text-zinc-500 border-zinc-200',
}
const DECISION_LABELS = { relevant: 'Relevant', uncertain: 'Uncertain', excluded: 'Excluded' }

function DecisionBadge({ decision }: { decision: FsnResult['filter_decision'] & object extends never ? never : NonNullable<FsnResult['filter_decision']>['decision'] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${DECISION_STYLES[decision]}`}>
      {DECISION_LABELS[decision]}
    </span>
  )
}

function ResultRow({ result }: { result: FsnResult }) {
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
            <span className="uppercase tracking-wide text-zinc-400">{result.source_db}</span>
            {d && <span className="text-zinc-400">{Math.round(d.confidence * 100)}% confidence</span>}
          </div>

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

export function RunResults({ results }: { results: FsnResult[] }) {
  const [tab, setTab] = useState<Tab>('all')

  const sorted = [
    ...results.filter((r) => r.filter_decision?.decision === 'relevant'),
    ...results.filter((r) => r.filter_decision?.decision === 'uncertain'),
    ...results.filter((r) => r.filter_decision?.decision === 'excluded'),
    ...results.filter((r) => !r.filter_decision),
  ]

  const counts = {
    all:       results.length,
    relevant:  results.filter((r) => r.filter_decision?.decision === 'relevant').length,
    uncertain: results.filter((r) => r.filter_decision?.decision === 'uncertain').length,
    excluded:  results.filter((r) => r.filter_decision?.decision === 'excluded').length,
  }

  const filtered = tab === 'all'
    ? sorted
    : sorted.filter((r) => r.filter_decision?.decision === tab)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',       label: `All (${counts.all})` },
    { key: 'relevant',  label: `Relevant (${counts.relevant})` },
    { key: 'uncertain', label: `Uncertain (${counts.uncertain})` },
    { key: 'excluded',  label: `Excluded (${counts.excluded})` },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-200 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 py-8 text-center">No results in this category.</p>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white">
          {filtered.map((r) => <ResultRow key={r.id} result={r} />)}
        </div>
      )}
    </div>
  )
}
