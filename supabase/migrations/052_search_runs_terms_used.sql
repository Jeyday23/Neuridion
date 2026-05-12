-- 052_search_runs_terms_used.sql
-- Persist computed search terms for audit reproducibility (P0 audit fix)
ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS terms_used jsonb;
