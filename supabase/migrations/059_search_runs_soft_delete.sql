-- Add soft-delete columns to search_runs for EU MDR 10-year retention compliance.
-- Runs are never hard-deleted; the API sets deleted_at instead.

ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by   uuid        DEFAULT NULL REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_search_runs_deleted_at
  ON public.search_runs (deleted_at)
  WHERE deleted_at IS NULL;
