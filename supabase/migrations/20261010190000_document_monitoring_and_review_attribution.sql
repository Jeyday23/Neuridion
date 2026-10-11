-- Release schema 76.
--
-- 1. Source document monitoring (Workstream A).
--    Regulators can replace an attached PDF at the same URL without changing the
--    notice page. Text hashing alone cannot see that. This migration adds:
--      * source_document_versions: append-only history of every distinct
--        document body (sha256) observed per authority record and URL, with
--        the HTTP validators and upstream metadata seen at retrieval time.
--      * attachment manifest + digest on fsn_canonical (current state) and on
--        fsn_results (state the run actually screened). Comparing the two at
--        read time tells a reviewer that a run's inputs were superseded,
--        without mutating approved evidence.
--      * last_observation_degraded on fsn_canonical so a partial observation
--        (detail fetch failed, one MHRA channel down) never overwrites a
--        complete one and never produces a false "content changed" signal.
--
-- 2. Review attribution (Workstream B).
--      * search_runs.approved_by / approved_at so approval no longer overwrites
--        the reviewer attribution in reviewed_by / reviewed_at.
--      * run_reviewer_assignment_revocations: run_reviewer_assignments is
--        append-only, so revocation is recorded as an append-only fact.
--
-- All new tables are service-role only (RLS on, no policies, anon and
-- authenticated revoked), matching the 068/071 evidence tables.

-- ── 1a. Current attachment state ─────────────────────────────────────────────
ALTER TABLE public.fsn_canonical
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS attachment_digest text,
  ADD COLUMN IF NOT EXISTS attachments_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_observation_degraded boolean NOT NULL DEFAULT false;

ALTER TABLE public.fsn_canonical
  DROP CONSTRAINT IF EXISTS fsn_canonical_attachment_digest_format;
ALTER TABLE public.fsn_canonical
  ADD CONSTRAINT fsn_canonical_attachment_digest_format
  CHECK (attachment_digest IS NULL OR attachment_digest ~ '^[0-9a-f]{64}$');

-- ── 1b. Attachment state screened by a run ──────────────────────────────────
ALTER TABLE public.fsn_results
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS attachment_digest text;

ALTER TABLE public.fsn_results
  DROP CONSTRAINT IF EXISTS fsn_results_attachment_digest_format;
ALTER TABLE public.fsn_results
  ADD CONSTRAINT fsn_results_attachment_digest_format
  CHECK (attachment_digest IS NULL OR attachment_digest ~ '^[0-9a-f]{64}$');

-- ── 1c. Append-only document version history ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.source_document_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL CHECK (source IN ('bfarm', 'mhra', 'fda', 'swissmedic')),
  source_record_id    text NOT NULL,
  document_url        text NOT NULL CHECK (document_url ~ '^https://'),
  sha256              text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size           bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  content_type        text,
  etag                text,
  last_modified       text,
  upstream_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Private regulatory-evidence bucket object, when byte archiving is enabled.
  storage_path        text CHECK (storage_path IS NULL OR storage_path ~ '^source-documents/'),
  previous_version_id uuid REFERENCES public.source_document_versions(id),
  first_retrieved_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_record_id, document_url, sha256)
);

CREATE INDEX IF NOT EXISTS idx_source_document_versions_record
  ON public.source_document_versions (source, source_record_id, document_url, first_retrieved_at DESC);

DROP TRIGGER IF EXISTS trg_source_document_versions_append_only ON public.source_document_versions;
CREATE TRIGGER trg_source_document_versions_append_only
  BEFORE UPDATE OR DELETE ON public.source_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

ALTER TABLE public.source_document_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.source_document_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.source_document_versions TO service_role;

-- ── 2a. Approval attribution ────────────────────────────────────────────────
ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- ── 2b. Reviewer assignment revocation ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.run_reviewer_assignment_revocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL UNIQUE REFERENCES public.run_reviewer_assignments(id),
  revoked_by     uuid NOT NULL REFERENCES public.users(id),
  reason         text CHECK (reason IS NULL OR length(reason) <= 500),
  revoked_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_run_reviewer_assignment_revocations_append_only
  ON public.run_reviewer_assignment_revocations;
CREATE TRIGGER trg_run_reviewer_assignment_revocations_append_only
  BEFORE UPDATE OR DELETE ON public.run_reviewer_assignment_revocations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

ALTER TABLE public.run_reviewer_assignment_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.run_reviewer_assignment_revocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.run_reviewer_assignment_revocations TO service_role;

-- ── Release marker ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.neuridion_release_schema_version()
RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT 76 $$;
REVOKE ALL ON FUNCTION public.neuridion_release_schema_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neuridion_release_schema_version() TO service_role;
