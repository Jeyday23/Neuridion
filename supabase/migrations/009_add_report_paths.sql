-- Stores storage paths (not signed URLs) for generated reports on each search run.
-- Signed URLs are regenerated on demand from these paths.

ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS report_html_path  text,
  ADD COLUMN IF NOT EXISTS report_pdf_path   text,
  ADD COLUMN IF NOT EXISTS report_excel_path text,
  ADD COLUMN IF NOT EXISTS report_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_search_runs_user_created
  ON public.search_runs(user_id, created_at DESC);
