import type { Json } from '@/types/supabase'

type EvidenceTable<Row, Insert> = {
  Row: Row
  Insert: Insert
  Update: Partial<Row>
  Relationships: []
}

export type EvidenceDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      source_fetches: EvidenceTable<{
        id: string
        source: string
        request_locator: string
        adapter_name: string
        adapter_version: string
        fetch_started_at: string
        fetch_completed_at: string
        http_status: number | null
        outcome: string
        warnings: Json
        created_at: string
      }, {
        id?: string
        source: string
        request_locator: string
        adapter_name: string
        adapter_version: string
        fetch_started_at: string
        fetch_completed_at: string
        http_status?: number | null
        outcome: string
        warnings?: Json
        created_at?: string
      }>
      evidence_objects: EvidenceTable<{
        id: string
        content_hash: string
        storage_bucket: string
        storage_path: string
        media_type: string
        byte_size: number
        artifact_kind: string
        contains_personal_data: boolean
        first_seen_at: string
      }, {
        id?: string
        content_hash: string
        storage_bucket: string
        storage_path: string
        media_type: string
        byte_size: number
        artifact_kind: string
        contains_personal_data?: boolean
        first_seen_at?: string
      }>
      fetch_artifacts: EvidenceTable<{
        fetch_id: string
        evidence_id: string
        source_url: string | null
        artifact_role: string
        observed_at: string
      }, {
        fetch_id: string
        evidence_id: string
        source_url?: string | null
        artifact_role: string
        observed_at?: string
      }>
      fsn_observations: EvidenceTable<{
        id: string
        fetch_id: string
        authority_record_id: string
        evidence_id: string
        source: string
        source_record_id: string
        identity_method: string
        identity_confidence: number
        fsca_reference: string | null
        basic_udi_di: string | null
        manufacturer_key: string | null
        title: string | null
        manufacturer: string | null
        product_name: string | null
        fsn_date: string | null
        source_url: string | null
        source_payload_hash: string
        normalized_hash: string
        parser_version: string
        observed_at: string
      }, {
        id?: string
        fetch_id: string
        authority_record_id: string
        evidence_id: string
        source: string
        source_record_id: string
        identity_method: string
        identity_confidence: number
        fsca_reference?: string | null
        basic_udi_di?: string | null
        manufacturer_key?: string | null
        title?: string | null
        manufacturer?: string | null
        product_name?: string | null
        fsn_date?: string | null
        source_url?: string | null
        source_payload_hash: string
        normalized_hash: string
        parser_version: string
        observed_at?: string
      }>
      authority_record_revisions: EvidenceTable<{
        id: string
        authority_record_id: string
        observation_id: string
        revision_number: number
        source_payload_hash: string
        previous_revision_hash: string | null
        revision_hash: string
        changed_fields: Json
        valid_from: string
      }, {
        id?: string
        authority_record_id: string
        observation_id: string
        revision_number: number
        source_payload_hash: string
        previous_revision_hash?: string | null
        revision_hash: string
        changed_fields?: Json
        valid_from?: string
      }>
      evidence_governance_events: EvidenceTable<{
        id: string
        evidence_id: string
        event_type: string
        basis: string
        retention_until: string | null
        event_metadata: Json
        occurred_at: string
      }, {
        id?: string
        evidence_id: string
        event_type: string
        basis: string
        retention_until?: string | null
        event_metadata?: Json
        occurred_at?: string
      }>
      document_extraction_attempts: EvidenceTable<{
        id: string
        evidence_id: string
        extractor_version: string
        status: string
        warnings: Json
        metadata: Json
        created_at: string
      }, {
        id?: string
        evidence_id: string
        extractor_version: string
        status: string
        warnings?: Json
        metadata?: Json
        created_at?: string
      }>
      document_extractions: EvidenceTable<{
        id: string
        evidence_id: string
        extractor_version: string
        status: string
        has_text_layer: boolean | null
        page_count: number | null
        text_chars: number | null
        language: string | null
        warnings: Json
        created_at: string
      }, {
        id?: string
        evidence_id: string
        extractor_version: string
        status: string
        has_text_layer?: boolean | null
        page_count?: number | null
        text_chars?: number | null
        language?: string | null
        warnings?: Json
        created_at?: string
      }>
      fsn_detail: EvidenceTable<{
        id: string
        extraction_id: string
        authority_record_id: string | null
        fsca_reference: string | null
        udi_dis: string[]
        ref_numbers: string[]
        lot_numbers: string[]
        serial_numbers: string[]
        product_names: string[]
        action_required: string | null
        field_provenance: Json
        ungrounded_dropped: Json
        created_at: string
      }, {
        id?: string
        extraction_id: string
        authority_record_id?: string | null
        fsca_reference?: string | null
        udi_dis?: string[]
        ref_numbers?: string[]
        lot_numbers?: string[]
        serial_numbers?: string[]
        product_names?: string[]
        action_required?: string | null
        field_provenance?: Json
        ungrounded_dropped?: Json
        created_at?: string
      }>
      fsn_identity_observations: EvidenceTable<{
        id: string
        authority_record_id: string
        extraction_id: string
        observation_type: string
        observed_value: string
        normalized_value: string
        confidence: number
        provenance: Json
        created_at: string
      }, {
        id?: string
        authority_record_id: string
        extraction_id: string
        observation_type: string
        observed_value: string
        normalized_value: string
        confidence: number
        provenance?: Json
        created_at?: string
      }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
