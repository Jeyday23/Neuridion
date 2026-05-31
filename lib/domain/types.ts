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
  fsn_date: string | null
  source_url: string
  source_db: string
  filter_decision: Omit<FilterDecision, 'model'> | null
}
