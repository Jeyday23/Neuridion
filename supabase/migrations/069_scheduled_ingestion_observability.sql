-- Scheduled regulatory ingestion observability and shadow comparison.
-- Search serving remains live until a separately reviewed pipeline integration.

CREATE TABLE public.ingestion_runs (
  id                    uuid PRIMARY KEY,
  source                text NOT NULL CHECK (source IN ('bfarm', 'mhra', 'swissmedic')),
  adapter_version       text NOT NULL,
  window_from           date NOT NULL,
  window_to             date NOT NULL,
  status                text NOT NULL CHECK (status IN ('running', 'complete', 'empty', 'partial', 'failed')),
  attempt_count         integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  observations          integer NOT NULL DEFAULT 0 CHECK (observations >= 0),
  new_revisions         integer NOT NULL DEFAULT 0 CHECK (new_revisions >= 0),
  warnings              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  error_code            text,
  lease_expires_at      timestamptz NOT NULL,
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (window_from <= window_to),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX ingestion_runs_source_started_idx
  ON public.ingestion_runs (source, started_at DESC);

CREATE TABLE public.shadow_comparisons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                text NOT NULL CHECK (source IN ('bfarm', 'mhra', 'swissmedic')),
  window_from           date NOT NULL,
  window_to             date NOT NULL,
  query_fingerprint     text NOT NULL CHECK (query_fingerprint ~ '^[0-9a-f]{64}$'),
  live_count            integer NOT NULL CHECK (live_count >= 0),
  mirror_count          integer NOT NULL CHECK (mirror_count >= 0),
  only_live             integer NOT NULL CHECK (only_live >= 0),
  only_mirror           integer NOT NULL CHECK (only_mirror >= 0),
  common_count          integer NOT NULL CHECK (common_count >= 0),
  agreement             numeric NOT NULL CHECK (agreement BETWEEN 0 AND 1),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (window_from <= window_to)
);

CREATE INDEX shadow_comparisons_source_created_idx
  ON public.shadow_comparisons (source, created_at DESC);

ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_comparisons ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ingestion_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.shadow_comparisons FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ingestion_runs TO service_role;
GRANT SELECT, INSERT ON TABLE public.shadow_comparisons TO service_role;

-- Claim an idempotent QStash job. Completed outcomes are never re-run. Failed or
-- expired jobs may be reclaimed up to three total attempts.
CREATE OR REPLACE FUNCTION public.claim_ingestion_run(
  p_id uuid,
  p_source text,
  p_adapter_version text,
  p_window_from date,
  p_window_to date
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  claimed_id uuid;
BEGIN
  INSERT INTO public.ingestion_runs (
    id, source, adapter_version, window_from, window_to,
    status, attempt_count, lease_expires_at, started_at
  ) VALUES (
    p_id, p_source, p_adapter_version, p_window_from, p_window_to,
    'running', 1, now() + interval '15 minutes', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'running',
    attempt_count = public.ingestion_runs.attempt_count + 1,
    lease_expires_at = now() + interval '15 minutes',
    started_at = now(),
    finished_at = NULL,
    error_code = NULL,
    observations = 0,
    new_revisions = 0,
    warnings = '[]'::jsonb
  WHERE public.ingestion_runs.attempt_count < 3
    AND public.ingestion_runs.source = p_source
    AND public.ingestion_runs.adapter_version = p_adapter_version
    AND public.ingestion_runs.window_from = p_window_from
    AND public.ingestion_runs.window_to = p_window_to
    AND (
      public.ingestion_runs.status = 'failed'
      OR (
        public.ingestion_runs.status = 'running'
        AND public.ingestion_runs.lease_expires_at < now()
      )
    )
  RETURNING id INTO claimed_id;

  RETURN claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ingestion_run(uuid, text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ingestion_run(uuid, text, text, date, date) TO service_role;
