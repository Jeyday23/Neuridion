-- Add 'degraded' as a valid search_run status.
-- A degraded run completed but with known gaps — e.g. a scraper hit a
-- pagination cap or returned zero rows due to a parsing issue. Results
-- are present but may be incomplete. Distinct from 'error' (no results).
--
-- The original migration 002 declared ('pending','running','completed','failed')
-- but the application has always written 'complete' and 'error'. This migration
-- normalises the constraint to match actual usage and adds 'degraded'.

ALTER TABLE public.search_runs
  DROP CONSTRAINT IF EXISTS search_runs_status_check;

ALTER TABLE public.search_runs
  ADD CONSTRAINT search_runs_status_check
  CHECK (status IN ('pending', 'running', 'complete', 'error', 'degraded'));
