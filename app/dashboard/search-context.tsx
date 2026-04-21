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

export type SearchRunState =
  | { phase: 'idle' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'done'; runId: string; results: FsnResult[]; counts: { relevant: number; uncertain: number; excluded: number }; startedAt: number }
  | { phase: 'error'; message: string }

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
