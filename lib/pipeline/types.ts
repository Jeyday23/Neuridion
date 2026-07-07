import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import type { FilterDecision } from '@/lib/claude/filter-pipeline'
import type { Database } from '@/types/supabase'

export interface SearchJobPayload {
  profile_id:    string
  period_from:   string
  period_to:     string
  selected_dbs:  string[]
  user_id:       string
  force_refresh: boolean
}

export interface ProgressUpdate {
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
  status: 'complete' | 'complete_with_fallback' | 'empty' | 'partial' | 'failed'
  fresh_outcomes: string[]
  warnings: number
}

export interface ProfileRow {
  device_name:    string
  manufacturer:   string
  intended_use:   string | null
  emdn_code:      string | null
  device_class:   string | null
  search_strategy: {
    competitor_terms?: Array<{ name: string; manufacturer?: string }>
  } | null
}

export interface InsertedFsnRow {
  id:           string
  authority_revision_id?: string | null
  external_id:  string | null
  title:        string
  manufacturer: string | null
  raw_content:  string | null
  fsn_date:     string | null
  source_db:    string | null
  source_url:   string | null
}

export interface DecisionRow extends FilterDecision {
  fsn_result_id: string
}

export interface PipelineContext {
  runId:           string
  payload:         SearchJobPayload
  db:              SupabaseClient<Database>
  profile:         ProfileRow
  aiOptOut:        boolean
  searchTerms:     string[]
  competitorTerms: string[]
  activeSources:   string[]

  items:           ScrapedFsn[]
  contentChanged:  Set<string>
  canonicalIds:    Map<string, string>
  authorityRevisionIds?: Map<string, string>
  insertedRows:    InsertedFsnRow[]
  decisions:       DecisionRow[]
  warnings:        string[]
  timing:          Record<string, unknown>
  sourceBreakdown: SourceResultBreakdown[]

  onProgress?:     (update: ProgressUpdate) => Promise<void>

  /**
   * Checks whether the run has been cancelled by the user.
   * Returns `true` if the run's status in the database is 'cancelled'.
   * Stages should call this periodically and return early with partial results
   * rather than throwing when cancelled.
   */
  isCancelled:     () => Promise<boolean>
}
