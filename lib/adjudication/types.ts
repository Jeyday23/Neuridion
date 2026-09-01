import type { FilterVerdict } from '@/lib/domain/types'

export type HumanDisposition = 'relevant' | 'uncertain' | 'excluded'
export type AdjudicationPhase = 'provisional_blind' | 'final' | 'second_review'
export type ReviewerRole = 'prrc' | 'regulatory_affairs' | 'quality_assurance' | 'clinical' | 'other'
export type ReviewerAssignmentRole = 'primary' | 'secondary' | 'both'

export interface AdjudicationResultRecord {
  id: string
  title: string
  manufacturer: string | null
  fsn_date: string | null
  source_url: string | null
  source_db: string
  raw_content?: string | null
}

export interface AdjudicationFilterDecision {
  id: string
  fsn_result_id: string
  decision: FilterVerdict
  rationale: string
  confidence: number | null
  model_used: string | null
  prompt_version: string | null
  authority_revision_id: string | null
  evidence_parser_version: string | null
  decided_at: string
}

export interface ReviewRequirement {
  id: string
  search_run_id: string
  fsn_result_id: string
  filter_decision_id: string
  requirement_reason: string
  blind_review_required: boolean
  blind_policy_version: string | null
  blind_inclusion_probability: number | null
  source_reference_id: string | null
  created_at: string
}

export interface AdjudicationEvent {
  id: string
  search_run_id: string
  fsn_result_id: string
  filter_decision_id: string
  reviewer_id: string
  phase: AdjudicationPhase
  disposition: HumanDisposition
  confidence: number | null
  rationale: string
  reviewer_role: ReviewerRole
  qualification_attestation: string
  attests_qualified: boolean
  blind_to_ai: boolean
  provisional_event_id: string | null
  supersedes_event_id: string | null
  review_of_event_id: string | null
  requires_second_review: boolean
  material_change: boolean
  serious_event_signal: boolean
  ai_model_snapshot: string | null
  ai_prompt_version_snapshot: string | null
  authority_revision_id: string | null
  evidence_parser_version_snapshot: string | null
  created_at: string
}

export interface PublicAdjudicationEvent {
  id: string
  phase: AdjudicationPhase
  disposition: HumanDisposition
  confidence: number | null
  rationale: string
  reviewer_id: string
  reviewer_role: ReviewerRole
  qualification_attestation: string
  blind_to_ai: boolean
  requires_second_review: boolean
  material_change: boolean
  serious_event_signal: boolean
  created_at: string
}

export interface AdjudicationRecordState {
  fsn_result: Omit<AdjudicationResultRecord, 'raw_content'>
  review_required: boolean
  requirement_reasons: string[]
  blind_review_required: boolean
  ai_revealed: boolean
  /**
   * Deliberately absent while this viewer still owes a blind provisional
   * disposition. `null` is reserved for records that genuinely have no AI
   * decision; callers must not serialize a redacted decision-shaped object.
   */
  filter_decision?: Omit<AdjudicationFilterDecision,
    'fsn_result_id' | 'authority_revision_id' | 'evidence_parser_version'> | null
  provisional_blind: PublicAdjudicationEvent | null
  final: PublicAdjudicationEvent | null
  second_review: PublicAdjudicationEvent | null
  complete: boolean
}

export interface AdjudicationPermissions {
  is_owner: boolean
  assignment_role: ReviewerAssignmentRole | null
  can_primary_review: boolean
  can_second_review: boolean
}
