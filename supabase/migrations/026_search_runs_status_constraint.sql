-- Drop the old constraint that was missing pending, degraded, failed, cancelled
ALTER TABLE public.search_runs
  DROP CONSTRAINT search_runs_status_check;

-- Recreate with the full set of valid status values
ALTER TABLE public.search_runs
  ADD CONSTRAINT search_runs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'queued'::text,
    'running'::text,
    'filtering'::text,
    'complete'::text,
    'degraded'::text,
    'error'::text,
    'failed'::text,
    'cancelled'::text
  ]));
