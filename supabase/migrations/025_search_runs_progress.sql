-- 025_search_runs_progress.sql
-- Adds live progress column to search_runs for Supabase Realtime broadcast.

ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS progress jsonb;

-- Enable Realtime so the frontend can subscribe to per-row UPDATE events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_runs;
