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

-- Clean up any orphaned search_job_queue entries that are still 'running'
-- or 'pending' with no recent activity. These are from the async architecture
-- that was removed in May 2026.
UPDATE public.search_job_queue
SET
  status       = 'failed',
  error        = 'Recovered by lifecycle audit — no completion signal.',
  completed_at = COALESCE(completed_at, NOW())
WHERE status IN ('running', 'pending')
  AND created_at < NOW() - INTERVAL '1 hour';
