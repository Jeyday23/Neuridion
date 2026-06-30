'use client'

import { createContext, useContext, useState } from 'react'

interface FilterDecision {
  decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale: string
  confidence: number | null
  model: string | null
}

export interface FsnResult {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source: string
  filter_decision: FilterDecision | null
}

export interface SearchProgress {
  current_source: string | null
  sources_done:   string[]
  sources_total:  string[]
  items_found:    number
  source_breakdown?: SourceResultBreakdown[]
  filter_progress?: { done: number; total: number; cached: number }
}

export interface SourceResultBreakdown {
  source: string
  requested_from: string
  requested_to: string
  fresh_fetched: number
  cached_loaded: number
  found_before_filtering: number
  after_keyword_signal: number
  rejected_by_keyword_signal: number
  status: 'complete' | 'empty' | 'partial' | 'failed'
  fresh_outcomes: string[]
  warnings: number
}

export type SearchRunState =
  | { phase: 'idle' }
  | { phase: 'queued';  runId: string; startedAt: number }
  | { phase: 'running'; runId: string; startedAt: number; progress: SearchProgress | null }
  | { phase: 'done';    runId: string; results: FsnResult[]; counts: { relevant: number; uncertain: number; excluded: number }; totalScraped: number | null; preFilterCount: number | null; sourceBreakdown: SourceResultBreakdown[] | null; startedAt: number; degraded?: boolean }
  | { phase: 'error';   message: string }

interface SearchContextValue {
  searchState: SearchRunState
  setSearchState: (s: SearchRunState) => void
}

const SearchContext = createContext<SearchContextValue>({
  searchState: { phase: 'idle' },
  setSearchState: () => {},
})

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [searchState, setSearchState] = useState<SearchRunState>({ phase: 'idle' })
  return (
    <SearchContext.Provider value={{ searchState, setSearchState }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearchContext() {
  return useContext(SearchContext)
}
