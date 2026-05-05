-- 024_search_job_queue.sql
-- Postgres-backed job queue for async search pipeline execution.

CREATE TABLE IF NOT EXISTS public.search_job_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid        NOT NULL REFERENCES public.search_runs(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  payload      jsonb       NOT NULL,
  progress     jsonb,
  worker_id    text,
  locked_at    timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Composite index: worker polls WHERE status = 'pending' ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_job_queue_status_created
  ON public.search_job_queue(status, created_at);

ALTER TABLE public.search_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_job_queue"
  ON public.search_job_queue
  AS RESTRICTIVE
  USING (false)
  WITH CHECK (false);

-- ── RPC: claim_next_job ───────────────────────────────────────────────────────
-- Atomically claims one pending job using SELECT FOR UPDATE SKIP LOCKED.
-- Returns the claimed row, or empty result set if no jobs are pending.

CREATE OR REPLACE FUNCTION public.claim_next_job(p_worker_id text)
RETURNS TABLE (id uuid, run_id uuid, payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT j.id INTO v_job_id
  FROM public.search_job_queue j
  WHERE j.status = 'pending'
  ORDER BY j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.search_job_queue
  SET
    status     = 'running',
    worker_id  = p_worker_id,
    locked_at  = NOW(),
    started_at = NOW()
  WHERE public.search_job_queue.id = v_job_id;

  RETURN QUERY
  SELECT j.id, j.run_id, j.payload
  FROM public.search_job_queue j
  WHERE j.id = v_job_id;
END;
$$;

-- ── RPC: requeue_stale_jobs ───────────────────────────────────────────────────
-- Resets jobs stuck in 'running' for longer than p_timeout_minutes.
-- Resets both search_job_queue and search_runs to 'pending' atomically.
-- Returns the count of jobs re-queued.

CREATE OR REPLACE FUNCTION public.requeue_stale_jobs(p_timeout_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count   integer;
  v_run_ids uuid[];
BEGIN
  WITH requeued AS (
    UPDATE public.search_job_queue
    SET status = 'pending', worker_id = NULL, locked_at = NULL, started_at = NULL
    WHERE status = 'running'
      AND locked_at < NOW() - make_interval(mins => p_timeout_minutes)
    RETURNING run_id
  )
  SELECT COALESCE(array_agg(run_id), '{}'::uuid[]), COUNT(*)::integer
  INTO v_run_ids, v_count
  FROM requeued;

  IF v_count > 0 THEN
    UPDATE public.search_runs
    SET status = 'pending'
    WHERE id = ANY(v_run_ids);
  END IF;

  RETURN v_count;
END;
$$;
