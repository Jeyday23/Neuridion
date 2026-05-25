-- Rollback 059: Remove soft-delete columns from search_runs.
-- WARNING: Any rows with non-NULL deleted_at will lose that metadata.
DROP INDEX IF EXISTS idx_search_runs_deleted_at;
ALTER TABLE public.search_runs DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE public.search_runs DROP COLUMN IF EXISTS deleted_at;
