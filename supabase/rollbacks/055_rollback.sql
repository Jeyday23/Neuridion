-- Rollback 055: Remove profile_snapshot column; consent backfill is not reversible
-- (we don't know which rows had NULL consent_terms_at before the backfill).
ALTER TABLE public.search_runs DROP COLUMN IF EXISTS profile_snapshot;
