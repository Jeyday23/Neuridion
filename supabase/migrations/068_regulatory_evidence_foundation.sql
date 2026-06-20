-- Regulatory evidence foundation.
--
-- Important identity boundary:
--   fsn_canonical                 = one regulator/authority record
--   regulatory_safety_actions     = one real-world corrective action
--
-- Evidence rows are append-only. Redaction removes bytes from private storage
-- in application code and appends an evidence_governance_events row; hashes and
-- provenance remain available for audit.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'regulatory-evidence',
  'regulatory-evidence',
  false,
  52428800,
  ARRAY[
    'application/vnd.neuridion.adapter-output+json',
    'application/json', 'application/pdf', 'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.source_fetches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL CHECK (source IN ('bfarm', 'mhra', 'fda', 'swissmedic', 'eudamed')),
  request_locator     text NOT NULL,
  adapter_name        text NOT NULL,
  adapter_version     text NOT NULL,
  fetch_started_at    timestamptz NOT NULL,
  fetch_completed_at  timestamptz NOT NULL,
  http_status         integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  outcome             text NOT NULL CHECK (outcome IN ('complete', 'empty', 'partial', 'failed')),
  warnings            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (fetch_completed_at >= fetch_started_at)
);

CREATE INDEX source_fetches_source_completed_idx
  ON public.source_fetches (source, fetch_completed_at DESC);

CREATE TABLE public.evidence_objects (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash            text NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  storage_bucket          text NOT NULL,
  storage_path            text NOT NULL,
  media_type              text NOT NULL,
  byte_size               bigint NOT NULL CHECK (byte_size >= 0),
  artifact_kind           text NOT NULL CHECK (artifact_kind IN ('raw_response', 'adapter_output', 'attachment')),
  contains_personal_data  boolean NOT NULL DEFAULT false,
  first_seen_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fetch_artifacts (
  fetch_id       uuid NOT NULL REFERENCES public.source_fetches(id),
  evidence_id    uuid NOT NULL REFERENCES public.evidence_objects(id),
  source_url     text,
  artifact_role  text NOT NULL CHECK (artifact_role IN ('response', 'record', 'attachment')),
  observed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fetch_id, evidence_id, artifact_role)
);

CREATE TABLE public.fsn_observations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fetch_id              uuid NOT NULL REFERENCES public.source_fetches(id),
  authority_record_id   uuid NOT NULL REFERENCES public.fsn_canonical(id),
  evidence_id           uuid NOT NULL REFERENCES public.evidence_objects(id),
  source                text NOT NULL CHECK (source IN ('bfarm', 'mhra', 'fda', 'swissmedic', 'eudamed')),
  source_record_id      text NOT NULL,
  identity_method       text NOT NULL CHECK (identity_method IN (
                            'authority_reference', 'national_reference',
                            'udi_device_key', 'url_hash_low_stability', 'generated_low_stability'
                          )),
  identity_confidence   numeric NOT NULL CHECK (identity_confidence BETWEEN 0 AND 1),
  fsca_reference        text,
  basic_udi_di          text,
  manufacturer_key      text,
  title                 text,
  manufacturer          text,
  product_name          text,
  fsn_date              date,
  source_url            text,
  source_payload_hash   text NOT NULL CHECK (source_payload_hash ~ '^[0-9a-f]{64}$'),
  normalized_hash       text NOT NULL CHECK (normalized_hash ~ '^[0-9a-f]{64}$'),
  parser_version        text NOT NULL,
  observed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fsn_observations_authority_idx
  ON public.fsn_observations (authority_record_id, observed_at DESC);
CREATE INDEX fsn_observations_source_record_idx
  ON public.fsn_observations (source, source_record_id);
CREATE INDEX fsn_observations_reference_idx
  ON public.fsn_observations (manufacturer_key, fsca_reference)
  WHERE fsca_reference IS NOT NULL;

CREATE TABLE public.authority_record_revisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_record_id   uuid NOT NULL REFERENCES public.fsn_canonical(id),
  observation_id        uuid NOT NULL UNIQUE REFERENCES public.fsn_observations(id),
  revision_number       integer NOT NULL CHECK (revision_number > 0),
  source_payload_hash   text NOT NULL CHECK (source_payload_hash ~ '^[0-9a-f]{64}$'),
  previous_revision_hash text CHECK (previous_revision_hash IS NULL OR previous_revision_hash ~ '^[0-9a-f]{64}$'),
  revision_hash         text NOT NULL CHECK (revision_hash ~ '^[0-9a-f]{64}$'),
  changed_fields        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changed_fields) = 'object'),
  valid_from            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authority_record_id, revision_number)
);

CREATE INDEX authority_record_revisions_latest_idx
  ON public.authority_record_revisions (authority_record_id, revision_number DESC);

CREATE TABLE public.regulatory_safety_actions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_reference     text,
  manufacturer_key      text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.safety_action_match_assertions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safety_action_id      uuid NOT NULL REFERENCES public.regulatory_safety_actions(id),
  observation_id        uuid NOT NULL REFERENCES public.fsn_observations(id),
  method                text NOT NULL CHECK (method IN (
                            'issuer_reference', 'authority_record', 'human_review', 'fuzzy_candidate'
                          )),
  matched_on            text,
  confidence            numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  assertion_status      text NOT NULL CHECK (assertion_status IN ('proposed', 'confirmed', 'rejected')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX safety_action_assertions_observation_idx
  ON public.safety_action_match_assertions (observation_id, created_at DESC);

CREATE TABLE public.authority_record_supersessions (
  predecessor_id        uuid NOT NULL REFERENCES public.fsn_canonical(id),
  successor_id          uuid NOT NULL REFERENCES public.fsn_canonical(id),
  evidence_observation_id uuid REFERENCES public.fsn_observations(id),
  declared_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (predecessor_id, successor_id),
  CHECK (predecessor_id <> successor_id)
);

CREATE TABLE public.evidence_governance_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id           uuid NOT NULL REFERENCES public.evidence_objects(id),
  event_type            text NOT NULL CHECK (event_type IN (
                            'retention_assigned', 'legal_hold_applied', 'legal_hold_released',
                            'redaction_requested', 'redaction_completed', 'redaction_failed'
                          )),
  basis                 text NOT NULL,
  retention_until       date,
  event_metadata        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_metadata) = 'object'),
  occurred_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_governance_events_evidence_idx
  ON public.evidence_governance_events (evidence_id, occurred_at DESC);

ALTER TABLE public.fsn_results
  ADD COLUMN IF NOT EXISTS authority_revision_id uuid
    REFERENCES public.authority_record_revisions(id);

ALTER TABLE public.filter_decisions
  ADD COLUMN IF NOT EXISTS authority_revision_id uuid
    REFERENCES public.authority_record_revisions(id),
  ADD COLUMN IF NOT EXISTS evidence_parser_version text;

-- Generic append-only enforcement. Corrections are appended as new observations,
-- revisions, assertions, or governance events; existing facts are never rewritten.
CREATE OR REPLACE FUNCTION public.prevent_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'source_fetches', 'evidence_objects', 'fetch_artifacts', 'fsn_observations',
    'authority_record_revisions', 'regulatory_safety_actions',
    'safety_action_match_assertions', 'authority_record_supersessions',
    'evidence_governance_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation()',
      'trg_' || table_name || '_append_only', table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.source_fetches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fetch_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fsn_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_record_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_safety_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_action_match_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_record_supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_governance_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.source_fetches FROM anon, authenticated;
REVOKE ALL ON TABLE public.evidence_objects FROM anon, authenticated;
REVOKE ALL ON TABLE public.fetch_artifacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.fsn_observations FROM anon, authenticated;
REVOKE ALL ON TABLE public.authority_record_revisions FROM anon, authenticated;
REVOKE ALL ON TABLE public.regulatory_safety_actions FROM anon, authenticated;
REVOKE ALL ON TABLE public.safety_action_match_assertions FROM anon, authenticated;
REVOKE ALL ON TABLE public.authority_record_supersessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.evidence_governance_events FROM anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.source_fetches TO service_role;
GRANT SELECT, INSERT ON TABLE public.evidence_objects TO service_role;
GRANT SELECT, INSERT ON TABLE public.fetch_artifacts TO service_role;
GRANT SELECT, INSERT ON TABLE public.fsn_observations TO service_role;
GRANT SELECT, INSERT ON TABLE public.authority_record_revisions TO service_role;
GRANT SELECT, INSERT ON TABLE public.regulatory_safety_actions TO service_role;
GRANT SELECT, INSERT ON TABLE public.safety_action_match_assertions TO service_role;
GRANT SELECT, INSERT ON TABLE public.authority_record_supersessions TO service_role;
GRANT SELECT, INSERT ON TABLE public.evidence_governance_events TO service_role;

COMMENT ON TABLE public.fsn_canonical IS
  'One authority record per (source, source_record_id); not a cross-source safety action.';
COMMENT ON TABLE public.regulatory_safety_actions IS
  'A real-world corrective action that may be represented by multiple authority records.';
COMMENT ON COLUMN public.fsn_observations.basic_udi_di IS
  'Device-family evidence only; never sufficient by itself to identify a corrective action.';
