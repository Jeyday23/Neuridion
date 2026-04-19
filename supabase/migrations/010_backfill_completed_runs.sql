-- Backfill search_runs rows that are stuck in 'running' because the
-- catch block was writing to column 'error' (wrong) instead of 'error_message',
-- causing the whole update to be rejected silently by PostgREST.

-- Mark all stuck 'running' runs as 'completed'
UPDATE public.search_runs
SET status       = 'complete',
    completed_at = COALESCE(completed_at, started_at, created_at)
WHERE status = 'running';

-- Populate total_results from fsn_results count per run
UPDATE public.search_runs sr
SET total_results = (
  SELECT COUNT(*) FROM public.fsn_results fr WHERE fr.run_id = sr.id
)
WHERE total_results IS NULL OR total_results = 0;

-- Populate decision counts from filter_decisions
-- Note: filter_decisions links to search_runs via search_run_id
UPDATE public.search_runs sr
SET
  relevant_count  = COALESCE((
    SELECT COUNT(*) FROM public.filter_decisions fd
    WHERE fd.search_run_id = sr.id AND fd.decision = 'relevant'
  ), 0),
  uncertain_count = COALESCE((
    SELECT COUNT(*) FROM public.filter_decisions fd
    WHERE fd.search_run_id = sr.id AND fd.decision = 'uncertain'
  ), 0),
  excluded_count  = COALESCE((
    SELECT COUNT(*) FROM public.filter_decisions fd
    WHERE fd.search_run_id = sr.id AND fd.decision = 'excluded'
  ), 0)
WHERE relevant_count IS NULL OR uncertain_count IS NULL OR excluded_count IS NULL;

-- Populate dbs_searched from fsn_results source_db values
UPDATE public.search_runs sr
SET dbs_searched = (
  SELECT array_agg(DISTINCT source_db)
  FROM public.fsn_results fr
  WHERE fr.run_id = sr.id
)
WHERE dbs_searched IS NULL;
