'use client'

import Link from 'next/link'
import { Loader2, CheckCircle, XCircle, Search } from 'lucide-react'
import { useSearchContext } from './search-context'

export function SearchStatusWidget() {
  const { searchState, setSearchState } = useSearchContext()

  if (searchState.phase === 'idle') return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border bg-white shadow-lg shadow-zinc-200/60 px-4 py-3 flex items-start gap-3 max-w-xs w-full">
        {searchState.phase === 'running' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900">Search in progress</p>
              <p className="text-xs text-zinc-400 mt-0.5">Scraping BfArM &amp; running AI filter…</p>
            </div>
          </>
        )}

        {searchState.phase === 'done' && (
          <>
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900">Search complete</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {searchState.results.length} notices found &mdash;{' '}
                <span className="text-green-600">{searchState.counts.relevant} relevant</span>
                {searchState.counts.uncertain > 0 && (
                  <>, <span className="text-amber-600">{searchState.counts.uncertain} uncertain</span></>
                )}
              </p>
              <Link
                href="/dashboard/search"
                className="mt-1.5 inline-block text-xs font-medium text-blue-600 hover:underline"
              >
                View results →
              </Link>
            </div>
            <button
              onClick={() => setSearchState({ phase: 'idle' })}
              className="text-zinc-300 hover:text-zinc-500 shrink-0 ml-1"
              aria-label="Dismiss"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}

        {searchState.phase === 'error' && (
          <>
            <Search className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900">Search failed</p>
              <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{searchState.message}</p>
            </div>
            <button
              onClick={() => setSearchState({ phase: 'idle' })}
              className="text-zinc-300 hover:text-zinc-500 shrink-0 ml-1"
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
