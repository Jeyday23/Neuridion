-- 021_canonical_and_coverage.sql
-- Canonical record store + sync coverage tracking for incremental fetch

-- ── fsn_canonical ─────────────────────────────────────────────────────────────
-- One row per (source, source_record_id). Stable across search runs.
CREATE TABLE IF NOT EXISTS public.fsn_canonical (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text        NOT NULL,
  source_record_id text        NOT NULL,
  title            text        NOT NULL,
  manufacturer     text,
  product_name     text,
  fsn_date         date,
  source_url       text,
  raw_content      text        NOT NULL DEFAULT '',
  content_hash     text        NOT NULL,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  revision_count   integer     NOT NULL DEFAULT 1,
  UNIQUE (source, source_record_id)
);

-- ── sync_coverage ─────────────────────────────────────────────────────────────
-- Tracks contiguous covered date ranges per source.
-- Multiple rows per source represent separate non-overlapping intervals.
-- Watermark = MAX(covered_to) per source.
CREATE TABLE IF NOT EXISTS public.sync_coverage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL,
  covered_from date NOT NULL,
  covered_to   date NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sync_coverage_valid_range CHECK (covered_from <= covered_to)
);

CREATE INDEX IF NOT EXISTS sync_coverage_source_idx ON public.sync_coverage (source);

-- ── fsn_results additions ─────────────────────────────────────────────────────
ALTER TABLE public.fsn_results
  ADD COLUMN IF NOT EXISTS canonical_id  uuid REFERENCES public.fsn_canonical(id),
  ADD COLUMN IF NOT EXISTS content_hash  text;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.fsn_canonical  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_coverage  ENABLE ROW LEVEL SECURITY;

-- Service role only — these tables are internal infrastructure
CREATE POLICY "service_role_only_canonical"
  ON public.fsn_canonical
  USING (false);

CREATE POLICY "service_role_only_coverage"
  ON public.sync_coverage
  USING (false);
