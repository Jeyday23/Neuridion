-- 023_performance_indexes.sql
-- Performance indexes for high-traffic query patterns.

-- fsn_results: every result page load queries WHERE run_id = $1
CREATE INDEX IF NOT EXISTS idx_fsn_results_run_id
  ON public.fsn_results(run_id);

-- fsn_results: FK with no supporting index; used in canonical dedup joins
CREATE INDEX IF NOT EXISTS idx_fsn_results_canonical_id
  ON public.fsn_results(canonical_id);

-- fsn_results: archive page date-range filters
CREATE INDEX IF NOT EXISTS idx_fsn_results_date
  ON public.fsn_results(fsn_date);

-- filter_decisions: every run result load and count aggregation
CREATE INDEX IF NOT EXISTS idx_filter_decisions_run_id
  ON public.filter_decisions(search_run_id);

-- filter_decisions: FK with no supporting index; used in per-FSN decision joins
CREATE INDEX IF NOT EXISTS idx_filter_decisions_result_id
  ON public.filter_decisions(fsn_result_id);

-- search_runs: profile detail page lists runs by profile
CREATE INDEX IF NOT EXISTS idx_search_runs_profile_id
  ON public.search_runs(profile_id);

-- search_runs: background worker will poll WHERE status = 'pending' every 3 seconds
CREATE INDEX IF NOT EXISTS idx_search_runs_status
  ON public.search_runs(status);

-- fsn_canonical: getCanonicalItems queries WHERE source = $1 AND fsn_date BETWEEN $2 AND $3
-- Composite index is far more selective than single-column fsn_date alone
CREATE INDEX IF NOT EXISTS idx_fsn_canonical_source_date
  ON public.fsn_canonical(source, fsn_date);

-- search_runs: plan enforcement queries WHERE user_id = $1 on every POST /api/search-runs
CREATE INDEX IF NOT EXISTS idx_search_runs_user_id
  ON public.search_runs(user_id);
