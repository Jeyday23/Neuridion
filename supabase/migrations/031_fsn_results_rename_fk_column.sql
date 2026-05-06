-- 031_fsn_results_rename_fk_column.sql
-- Migration 002 created fsn_results with search_run_id. Production was manually
-- patched to rename it to run_id (no migration existed). This migration makes
-- fresh deployments match production by renaming search_run_id → run_id if the
-- old name is still present and run_id doesn't already exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fsn_results' AND column_name = 'search_run_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fsn_results' AND column_name = 'run_id'
  ) THEN
    ALTER TABLE public.fsn_results RENAME COLUMN search_run_id TO run_id;
  END IF;
END $$;
