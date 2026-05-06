-- 028_recover_stuck_runs.sql
-- One-time recovery: mark all search_runs rows stuck at 'running' or 'pending'
-- as 'error'. These were created before the lifecycle fixes in May 2026 that
-- (a) set started_at at INSERT, (b) added try/catch to pipeline, and
-- (c) fixed cleanup to catch null started_at rows.
-- Only affects rows older than 1 hour to avoid touching any run currently
-- in progress at migration time.

UPDATE public.search_runs
SET
  status       = 'error',
  error        = 'Recovered by lifecycle audit — run had no completion record. Please retry.',
  completed_at = COALESCE(completed_at, NOW())
WHERE status IN ('running', 'pending')
  AND created_at < NOW() - INTERVAL '1 hour';

-- Clean up any orphaned search_job_queue entries. Wrapped in DO block
-- because the table may not exist on all environments (async arch was removed).
DO $$
BEGIN
  UPDATE public.search_job_queue
  SET
    status       = 'failed',
    error        = 'Recovered by lifecycle audit — no completion signal.',
    completed_at = COALESCE(completed_at, NOW())
  WHERE status IN ('running', 'pending')
    AND created_at < NOW() - INTERVAL '1 hour';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'search_job_queue does not exist, skipping';
END $$;
