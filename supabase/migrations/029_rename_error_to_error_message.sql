-- 029_rename_error_to_error_message.sql
-- The search_runs.error column was renamed to error_message in production.
-- This migration makes fresh deployments match. Safe to run on production
-- (where the column is already named error_message — the IF EXISTS guard no-ops).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'search_runs'
      AND column_name  = 'error'
  ) THEN
    ALTER TABLE public.search_runs RENAME COLUMN error TO error_message;
  END IF;
END $$;
