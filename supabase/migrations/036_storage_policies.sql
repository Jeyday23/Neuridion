-- Migration 036: Add storage bucket creation and RLS policies
-- Codifies storage access control that was previously only in the Dashboard (or missing)

-- Ensure the reports bucket exists (was created manually via Dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

-- Ensure search-attachments bucket exists (created in migration 016 but policies were missing)
-- No-op if already exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('search-attachments', 'search-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- REPORTS BUCKET POLICIES
-- Path convention: {user_id}/{run_id}/{timestamp}_report.{ext}
-- Uploads: service_role only (API route uses admin client)
-- Downloads: authenticated users can read their own files via signed URLs
-- ============================================================

CREATE POLICY "reports_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "reports_insert_service_role"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "reports_update_service_role"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'reports');

CREATE POLICY "reports_delete_service_role"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'reports');

-- ============================================================
-- SEARCH-ATTACHMENTS BUCKET POLICIES
-- Path convention: uploads/{key}_{filename} (no user_id prefix)
-- Uploads: any authenticated user (client-side upload from search panel)
-- Downloads: any authenticated user (files are referenced by search drafts)
-- Note: path does not contain user_id, so we cannot scope per-user.
-- Access control is enforced at the application layer via search_drafts ownership.
-- ============================================================

CREATE POLICY "attachments_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'search-attachments');

CREATE POLICY "attachments_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'search-attachments');

-- No UPDATE or DELETE for authenticated users — files are immutable once uploaded
-- Service role can manage all objects for cleanup
CREATE POLICY "attachments_all_service_role"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'search-attachments');
