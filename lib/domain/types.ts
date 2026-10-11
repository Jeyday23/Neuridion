export type FilterVerdict = 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'

export interface FilterDecision {
  decision: FilterVerdict
  rationale: string
  confidence: number | null
  model?: string | null
}

export interface FsnReportRow {
  id: string
  title: string
  manufacturer: string
  product_name?: string | null
  raw_content?: string | null
  fsn_date: string | null
  source_url: string
  source_db: string
  /** Effective disposition: final human review when available, otherwise automated. */
  filter_decision: Omit<FilterDecision, 'model'> | null
  decision_origin?: 'human' | 'automated'
  human_review?: { event_id: string; reviewer_id: string; reviewer_name?: string | null; reviewed_at: string; confidence: number | null }
  ai_history?: { id: string; decision: FilterVerdict; rationale: string; confidence: number | null; model_used: string | null; decided_at: string }[]
}
