-- PDF/detail extraction for content-addressed evidence objects.
--
-- evidence_objects remains the source of document truth. Extraction attempts
-- are append-only operational facts; document_extractions is the versioned,
-- idempotent result cache keyed by (evidence_id, extractor_version).

CREATE TABLE IF NOT EXISTS public.document_extraction_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id          uuid NOT NULL REFERENCES public.evidence_objects(id),
  extractor_version    text NOT NULL,
  status              text NOT NULL CHECK (status IN ('extracted', 'needs_ocr', 'failed', 'skipped_size', 'duplicate')),
  warnings            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_extraction_attempts_evidence_idx
  ON public.document_extraction_attempts (evidence_id, extractor_version, created_at DESC);

CREATE TABLE IF NOT EXISTS public.document_extractions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id          uuid NOT NULL REFERENCES public.evidence_objects(id),
  extractor_version    text NOT NULL,
  status              text NOT NULL CHECK (status IN ('extracted', 'needs_ocr', 'failed', 'skipped_size')),
  has_text_layer      boolean,
  page_count          integer,
  text_chars          integer,
  language            text CHECK (language IS NULL OR language IN ('de', 'en', 'mixed')),
  warnings            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id, extractor_version)
);

CREATE INDEX IF NOT EXISTS document_extractions_status_idx
  ON public.document_extractions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fsn_detail (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id        uuid NOT NULL REFERENCES public.document_extractions(id),
  authority_record_id  uuid REFERENCES public.fsn_canonical(id),
  fsca_reference      text,
  udi_dis             text[] NOT NULL DEFAULT '{}',
  ref_numbers         text[] NOT NULL DEFAULT '{}',
  lot_numbers         text[] NOT NULL DEFAULT '{}',
  serial_numbers      text[] NOT NULL DEFAULT '{}',
  product_names       text[] NOT NULL DEFAULT '{}',
  action_required     text,
  field_provenance    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(field_provenance) = 'object'),
  ungrounded_dropped  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ungrounded_dropped) = 'array'),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fsn_detail_fsca_idx
  ON public.fsn_detail (fsca_reference)
  WHERE fsca_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS fsn_detail_authority_record_idx
  ON public.fsn_detail (authority_record_id)
  WHERE authority_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fsn_identity_observations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_record_id  uuid NOT NULL REFERENCES public.fsn_canonical(id),
  extraction_id        uuid NOT NULL REFERENCES public.document_extractions(id),
  observation_type     text NOT NULL CHECK (observation_type IN ('fsca_reference', 'basic_udi_di', 'ref_number')),
  observed_value       text NOT NULL,
  normalized_value     text NOT NULL,
  confidence           numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  provenance           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authority_record_id, extraction_id, observation_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS fsn_identity_observations_lookup_idx
  ON public.fsn_identity_observations (observation_type, normalized_value);

DO $$
DECLARE
  table_name text;
  trigger_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'document_extraction_attempts',
    'document_extractions',
    'fsn_detail',
    'fsn_identity_observations'
  ]
  LOOP
    trigger_name := 'trg_' || table_name || '_append_only';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = trigger_name
        AND tgrelid = format('public.%I', table_name)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I ' ||
        'FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation()',
        trigger_name, table_name
      );
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.document_extraction_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fsn_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fsn_identity_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.document_extraction_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.document_extractions FROM anon, authenticated;
REVOKE ALL ON TABLE public.fsn_detail FROM anon, authenticated;
REVOKE ALL ON TABLE public.fsn_identity_observations FROM anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.document_extraction_attempts TO service_role;
GRANT SELECT, INSERT ON TABLE public.document_extractions TO service_role;
GRANT SELECT, INSERT ON TABLE public.fsn_detail TO service_role;
GRANT SELECT, INSERT ON TABLE public.fsn_identity_observations TO service_role;

COMMENT ON TABLE public.document_extractions IS
  'Versioned, append-only extraction result cache for PDF evidence objects.';
COMMENT ON TABLE public.fsn_detail IS
  'Structured FSN facts extracted from regulator PDFs with field-level provenance.';
COMMENT ON TABLE public.fsn_identity_observations IS
  'Append-only identity evidence learned from PDFs; does not mutate canonical records.';
