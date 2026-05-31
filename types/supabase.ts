export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          description: string
          id: string
          page_url: string | null
          status: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          page_url?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          page_url?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      filter_decision_cache: {
        Row: {
          confidence: string | null
          created_at: string
          decision: string
          fsn_external_id: string
          id: string
          profile_fingerprint: string
          reasoning: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          decision: string
          fsn_external_id: string
          id?: string
          profile_fingerprint: string
          reasoning?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string
          decision?: string
          fsn_external_id?: string
          id?: string
          profile_fingerprint?: string
          reasoning?: string | null
        }
        Relationships: []
      }
      filter_decisions: {
        Row: {
          confidence: number | null
          decided_at: string
          decision: string
          flagged_uncertain: boolean
          fsn_result_id: string
          id: string
          model_used: string | null
          prompt_version: string | null
          rationale: string
          search_run_id: string | null
          stage: string
        }
        Insert: {
          confidence?: number | null
          decided_at?: string
          decision: string
          flagged_uncertain?: boolean
          fsn_result_id: string
          id?: string
          model_used?: string | null
          prompt_version?: string | null
          rationale: string
          search_run_id?: string | null
          stage: string
        }
        Update: {
          confidence?: number | null
          decided_at?: string
          decision?: string
          flagged_uncertain?: boolean
          fsn_result_id?: string
          id?: string
          model_used?: string | null
          prompt_version?: string | null
          rationale?: string
          search_run_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_decisions_fsn_result_id_fkey"
            columns: ["fsn_result_id"]
            isOneToOne: false
            referencedRelation: "fsn_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_decisions_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fsn_canonical: {
        Row: {
          content_hash: string
          first_seen_at: string
          fsn_date: string | null
          id: string
          last_seen_at: string
          manufacturer: string | null
          product_name: string | null
          raw_content: string
          revision_count: number
          source: string
          source_record_id: string
          source_url: string | null
          title: string
        }
        Insert: {
          content_hash: string
          first_seen_at?: string
          fsn_date?: string | null
          id?: string
          last_seen_at?: string
          manufacturer?: string | null
          product_name?: string | null
          raw_content?: string
          revision_count?: number
          source: string
          source_record_id: string
          source_url?: string | null
          title: string
        }
        Update: {
          content_hash?: string
          first_seen_at?: string
          fsn_date?: string | null
          id?: string
          last_seen_at?: string
          manufacturer?: string | null
          product_name?: string | null
          raw_content?: string
          revision_count?: number
          source?: string
          source_record_id?: string
          source_url?: string | null
          title?: string
        }
        Relationships: []
      }
      fsn_results: {
        Row: {
          canonical_id: string | null
          content_hash: string | null
          created_at: string
          external_id: string | null
          fsn_date: string | null
          id: string
          manufacturer: string | null
          product_name: string | null
          raw_content: string | null
          run_id: string
          source: string | null
          source_db: string
          source_url: string | null
          title: string
        }
        Insert: {
          canonical_id?: string | null
          content_hash?: string | null
          created_at?: string
          external_id?: string | null
          fsn_date?: string | null
          id?: string
          manufacturer?: string | null
          product_name?: string | null
          raw_content?: string | null
          run_id: string
          source?: string | null
          source_db: string
          source_url?: string | null
          title: string
        }
        Update: {
          canonical_id?: string | null
          content_hash?: string | null
          created_at?: string
          external_id?: string | null
          fsn_date?: string | null
          id?: string
          manufacturer?: string | null
          product_name?: string | null
          raw_content?: string | null
          run_id?: string
          source?: string | null
          source_db?: string
          source_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fsn_results_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "fsn_canonical"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fsn_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email: string | null
          id: string
          ip_address: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          email?: string | null
          id?: string
          ip_address: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          email?: string | null
          id?: string
          ip_address?: string
          success?: boolean
        }
        Relationships: []
      }
      pdf_usage: {
        Row: {
          count: number
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_profiles: {
        Row: {
          created_at: string
          default_dbs: Json
          deleted_at: string | null
          device_class: string | null
          device_name: string
          emdn_code: string | null
          id: string
          ifu_storage_path: string | null
          intended_use: string | null
          last_modified_at: string
          last_modified_by: string | null
          manufacturer: string
          search_strategy: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          default_dbs?: Json
          deleted_at?: string | null
          device_class?: string | null
          device_name: string
          emdn_code?: string | null
          id?: string
          ifu_storage_path?: string | null
          intended_use?: string | null
          last_modified_at?: string
          last_modified_by?: string | null
          manufacturer: string
          search_strategy?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          default_dbs?: Json
          deleted_at?: string | null
          device_class?: string | null
          device_name?: string
          emdn_code?: string | null
          id?: string
          ifu_storage_path?: string | null
          intended_use?: string | null
          last_modified_at?: string
          last_modified_by?: string | null
          manufacturer?: string
          search_strategy?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_edit_history: {
        Row: {
          changed_fields: Json
          edited_at: string
          edited_by: string | null
          id: string
          previous_values: Json
          profile_id: string
        }
        Insert: {
          changed_fields: Json
          edited_at?: string
          edited_by?: string | null
          id?: string
          previous_values: Json
          profile_id: string
        }
        Update: {
          changed_fields?: Json
          edited_at?: string
          edited_by?: string | null
          id?: string
          previous_values?: Json
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_edit_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "product_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_drafts: {
        Row: {
          created_at: string
          dbs_selected: Json
          generic_terms: Json
          id: string
          manufacturer_terms: Json
          name: string | null
          profile_id: string | null
          search_period_from: string | null
          search_period_to: string | null
          updated_at: string
          uploaded_file_paths: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          dbs_selected?: Json
          generic_terms?: Json
          id?: string
          manufacturer_terms?: Json
          name?: string | null
          profile_id?: string | null
          search_period_from?: string | null
          search_period_to?: string | null
          updated_at?: string
          uploaded_file_paths?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          dbs_selected?: Json
          generic_terms?: Json
          id?: string
          manufacturer_terms?: Json
          name?: string | null
          profile_id?: string | null
          search_period_from?: string | null
          search_period_to?: string | null
          updated_at?: string
          uploaded_file_paths?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_drafts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "product_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_job_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          locked_at: string | null
          payload: Json
          progress: Json | null
          run_id: string
          started_at: string | null
          status: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          payload: Json
          progress?: Json | null
          run_id: string
          started_at?: string | null
          status?: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          payload?: Json
          progress?: Json | null
          run_id?: string
          started_at?: string | null
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_job_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          dbs_searched: Json
          deleted_at: string | null
          deleted_by: string | null
          error_message: string | null
          excluded_count: number
          filter_failed_count: number
          id: string
          period_from: string | null
          period_to: string | null
          pre_filter_count: number | null
          profile_id: string
          profile_snapshot: Json | null
          progress: Json | null
          relevant_count: number
          report_docx_path: string | null
          report_excel_path: string | null
          report_generated_at: string | null
          report_html_path: string | null
          report_pdf_path: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          search_period_from: string | null
          search_period_to: string | null
          search_strategy: Json
          started_at: string | null
          status: string
          terms_used: Json | null
          timing: Json | null
          total_results: number
          total_scraped: number | null
          uncertain_count: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dbs_searched?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          excluded_count?: number
          filter_failed_count?: number
          id?: string
          period_from?: string | null
          period_to?: string | null
          pre_filter_count?: number | null
          profile_id: string
          profile_snapshot?: Json | null
          progress?: Json | null
          relevant_count?: number
          report_docx_path?: string | null
          report_excel_path?: string | null
          report_generated_at?: string | null
          report_html_path?: string | null
          report_pdf_path?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_period_from?: string | null
          search_period_to?: string | null
          search_strategy?: Json
          started_at?: string | null
          status?: string
          terms_used?: Json | null
          timing?: Json | null
          total_results?: number
          total_scraped?: number | null
          uncertain_count?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dbs_searched?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          excluded_count?: number
          filter_failed_count?: number
          id?: string
          period_from?: string | null
          period_to?: string | null
          pre_filter_count?: number | null
          profile_id?: string
          profile_snapshot?: Json | null
          progress?: Json | null
          relevant_count?: number
          report_docx_path?: string | null
          report_excel_path?: string | null
          report_generated_at?: string | null
          report_html_path?: string | null
          report_pdf_path?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_period_from?: string | null
          search_period_to?: string | null
          search_strategy?: Json
          started_at?: string | null
          status?: string
          terms_used?: Json | null
          timing?: Json | null
          total_results?: number
          total_scraped?: number | null
          uncertain_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "product_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_coverage: {
        Row: {
          covered_from: string
          covered_to: string
          id: string
          source: string
          updated_at: string
        }
        Insert: {
          covered_from: string
          covered_to: string
          id?: string
          source: string
          updated_at?: string
        }
        Update: {
          covered_from?: string
          covered_to?: string
          id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      trial_codes: {
        Row: {
          batch_name: string | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          redeemed_at: string | null
          redeemed_by_email: string | null
          redeemed_by_user_id: string | null
        }
        Insert: {
          batch_name?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          redeemed_at?: string | null
          redeemed_by_email?: string | null
          redeemed_by_user_id?: string | null
        }
        Update: {
          batch_name?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          redeemed_at?: string | null
          redeemed_by_email?: string | null
          redeemed_by_user_id?: string | null
        }
        Relationships: []
      }
      used_trial_emails: {
        Row: {
          email: string
          trial_code_id: string
          used_at: string
        }
        Insert: {
          email: string
          trial_code_id: string
          used_at?: string
        }
        Update: {
          email?: string
          trial_code_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "used_trial_emails_trial_code_id_fkey"
            columns: ["trial_code_id"]
            isOneToOne: false
            referencedRelation: "trial_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          id: string
          missing_features: string | null
          most_useful: string[] | null
          rating: number
          submitted_at: string
          triggered_by: string
          user_id: string
        }
        Insert: {
          id?: string
          missing_features?: string | null
          most_useful?: string[] | null
          rating: number
          submitted_at?: string
          triggered_by: string
          user_id: string
        }
        Update: {
          id?: string
          missing_features?: string | null
          most_useful?: string[] | null
          rating?: number
          submitted_at?: string
          triggered_by?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          run_id: string
          user_id: string
          pdf_storage_path: string | null
          excel_storage_path: string | null
          generated_at: string
        }
        Insert: {
          id?: string
          run_id: string
          user_id: string
          pdf_storage_path?: string | null
          excel_storage_path?: string | null
          generated_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          user_id?: string
          pdf_storage_path?: string | null
          excel_storage_path?: string | null
          generated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          ai_opt_out: boolean
          company_name: string | null
          consent_cookies_at: string | null
          consent_privacy_at: string | null
          consent_terms_at: string | null
          created_at: string
          current_period_end: string | null
          deleted_at: string | null
          deletion_requested_at: string | null
          email: string
          full_name: string | null
          id: string
          plan: string
          processing_restricted: boolean
          role: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
        }
        Insert: {
          ai_opt_out?: boolean
          company_name?: string | null
          consent_cookies_at?: string | null
          consent_privacy_at?: string | null
          consent_terms_at?: string | null
          created_at?: string
          current_period_end?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          email: string
          full_name?: string | null
          id: string
          plan?: string
          processing_restricted?: boolean
          role?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
        }
        Update: {
          ai_opt_out?: boolean
          company_name?: string | null
          consent_cookies_at?: string | null
          consent_privacy_at?: string | null
          consent_terms_at?: string | null
          created_at?: string
          current_period_end?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          plan?: string
          processing_restricted?: boolean
          role?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_insert_search_run: {
        Args: {
          p_period_from: string
          p_period_to: string
          p_profile_id: string
          p_run_limit: number
          p_user_id: string
        }
        Returns: string
      }
      claim_next_job: {
        Args: { p_worker_id: string }
        Returns: {
          id: string
          payload: Json
          run_id: string
        }[]
      }
      gdpr_purge_user_data: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      increment_pdf_usage: {
        Args: { p_month: string; p_user_id: string }
        Returns: undefined
      }
      merge_coverage_for_source: {
        Args: { p_range_end: string; p_range_start: string; p_source: string }
        Returns: {
          covered_from: string
          covered_to: string
          id: string
          source: string
        }[]
      }
      purge_old_login_attempts: { Args: never; Returns: number }
      requeue_stale_jobs: {
        Args: { p_timeout_minutes?: number }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
