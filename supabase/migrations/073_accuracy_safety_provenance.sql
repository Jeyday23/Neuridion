-- Accuracy-safety provenance and auditable sampling populations.
--
-- Model output is presentation/ranking evidence, not an irreversible deletion.
-- Every new decision records the configuration and byte-level hashes needed to
-- distinguish a fresh computation from a cache reuse. Historical rows remain
-- nullable because their full inputs cannot be reconstructed honestly.

ALTER TABLE public.filter_decisions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS ruleset_version text,
  ADD COLUMN IF NOT EXISTS input_sha256 text,
  ADD COLUMN IF NOT EXISTS output_sha256 text,
  ADD COLUMN IF NOT EXISTS original_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS presentation_rank text,
  ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_method text,
  ADD COLUMN IF NOT EXISTS deterministic_reason_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS deterministic_evidence jsonb;

ALTER TABLE public.filter_decisions
  DROP CONSTRAINT IF EXISTS filter_decisions_provider_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_model_id_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_ruleset_version_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_input_sha256_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_output_sha256_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_presentation_rank_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_decision_method_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_deterministic_evidence_check,
  DROP CONSTRAINT IF EXISTS filter_decisions_cache_origin_check;

ALTER TABLE public.filter_decisions
  ADD CONSTRAINT filter_decisions_provider_check CHECK (
    provider IS NULL OR char_length(btrim(provider)) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT filter_decisions_model_id_check CHECK (
    model_id IS NULL OR char_length(btrim(model_id)) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT filter_decisions_ruleset_version_check CHECK (
    ruleset_version IS NULL OR char_length(btrim(ruleset_version)) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT filter_decisions_input_sha256_check CHECK (
    input_sha256 IS NULL OR input_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT filter_decisions_output_sha256_check CHECK (
    output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT filter_decisions_presentation_rank_check CHECK (
    presentation_rank IS NULL OR presentation_rank IN ('high', 'medium', 'low')
  ),
  ADD CONSTRAINT filter_decisions_decision_method_check CHECK (
    decision_method IS NULL OR decision_method IN (
      'ai_ranking', 'deterministic_scope', 'vigilance_bypass',
      'manual_review_required', 'ai_unavailable'
    )
  ),
  ADD CONSTRAINT filter_decisions_deterministic_evidence_check CHECK (
    deterministic_evidence IS NULL OR jsonb_typeof(deterministic_evidence) = 'object'
  ),
  ADD CONSTRAINT filter_decisions_cache_origin_check CHECK (
    cache_hit = false OR original_decision_at IS NOT NULL
  );

COMMENT ON COLUMN public.filter_decisions.input_sha256 IS
  'SHA-256 of the full bounded decision input snapshot; legacy rows may be null.';
COMMENT ON COLUMN public.filter_decisions.output_sha256 IS
  'SHA-256 of the exact normalized decision output; legacy rows may be null.';
COMMENT ON COLUMN public.filter_decisions.original_decision_at IS
  'Original computation time. On cache hits this is not the cache-read time.';
COMMENT ON COLUMN public.filter_decisions.presentation_rank IS
  'Provider-neutral ranking only; never authority to delete a regulatory record.';

-- Cached output is reusable only when the provider/model/prompt/ruleset and the
-- full sanitized input/output hashes match. Legacy cache rows remain present
-- but deliberately fail the application-side completeness check.
ALTER TABLE public.filter_decision_cache
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS ruleset_version text,
  ADD COLUMN IF NOT EXISTS input_sha256 text,
  ADD COLUMN IF NOT EXISTS output_sha256 text,
  ADD COLUMN IF NOT EXISTS original_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS presentation_rank text;

ALTER TABLE public.filter_decision_cache
  DROP CONSTRAINT IF EXISTS filter_decision_cache_input_sha256_check,
  DROP CONSTRAINT IF EXISTS filter_decision_cache_output_sha256_check,
  DROP CONSTRAINT IF EXISTS filter_decision_cache_presentation_rank_check;
ALTER TABLE public.filter_decision_cache
  ADD CONSTRAINT filter_decision_cache_input_sha256_check CHECK (
    input_sha256 IS NULL OR input_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT filter_decision_cache_output_sha256_check CHECK (
    output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT filter_decision_cache_presentation_rank_check CHECK (
    presentation_rank IS NULL OR presentation_rank IN ('high', 'medium', 'low')
  );

CREATE INDEX IF NOT EXISTS filter_decision_cache_provenance_idx
  ON public.filter_decision_cache (provider, model_id, prompt_version, ruleset_version);

ALTER TABLE public.exclusion_review_samples
  ADD COLUMN IF NOT EXISTS sample_source text NOT NULL DEFAULT 'model_presentation';

ALTER TABLE public.exclusion_review_samples
  DROP CONSTRAINT IF EXISTS exclusion_review_samples_source_check;
ALTER TABLE public.exclusion_review_samples
  ADD CONSTRAINT exclusion_review_samples_source_check CHECK (
    sample_source IN ('model_presentation', 'deterministic', 'human')
  );

-- Validate the population at write time. The stored probability, policy,
-- stratum and timestamp are already append-only under migration 072. A later
-- rule change therefore cannot silently reclassify an old sample.
CREATE OR REPLACE FUNCTION public.validate_exclusion_review_sample()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  linked_decision public.filter_decisions%ROWTYPE;
  linked_result public.fsn_results%ROWTYPE;
  current_human_exclusion boolean;
BEGIN
  SELECT * INTO linked_decision
  FROM public.filter_decisions
  WHERE id = NEW.filter_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review sample must reference a filter decision'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO linked_result
  FROM public.fsn_results
  WHERE id = NEW.fsn_result_id;

  IF NOT FOUND
     OR linked_decision.fsn_result_id IS DISTINCT FROM NEW.fsn_result_id
     OR linked_decision.search_run_id IS DISTINCT FROM NEW.search_run_id
     OR linked_result.run_id IS DISTINCT FROM NEW.search_run_id THEN
    RAISE EXCEPTION 'Review sample references do not belong to the same search run'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.sample_source = 'model_presentation' THEN
    IF linked_decision.decision_method IS DISTINCT FROM 'ai_ranking'
       OR linked_decision.presentation_rank IS DISTINCT FROM 'low'
       OR linked_decision.decision = 'excluded' THEN
      RAISE EXCEPTION 'Model-presentation samples require a retained low-ranked AI decision'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.sample_source = 'deterministic' THEN
    IF linked_decision.decision_method IS DISTINCT FROM 'deterministic_scope'
       OR linked_decision.decision IS DISTINCT FROM 'excluded' THEN
      RAISE EXCEPTION 'Deterministic samples require a deterministic excluded decision'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.human_adjudication_events final_event
      WHERE final_event.filter_decision_id = NEW.filter_decision_id
        AND final_event.fsn_result_id = NEW.fsn_result_id
        AND final_event.search_run_id = NEW.search_run_id
        AND final_event.phase = 'final'
        AND final_event.disposition = 'excluded'
        AND NOT EXISTS (
          SELECT 1 FROM public.human_adjudication_events successor
          WHERE successor.supersedes_event_id = final_event.id
        )
        AND (
          NOT final_event.requires_second_review
          OR EXISTS (
            SELECT 1 FROM public.human_adjudication_events second_review
            WHERE second_review.phase = 'second_review'
              AND second_review.review_of_event_id = final_event.id
              AND second_review.reviewer_id <> final_event.reviewer_id
              AND second_review.disposition = 'excluded'
          )
        )
    ) INTO current_human_exclusion;

    IF NOT current_human_exclusion THEN
      RAISE EXCEPTION 'Human samples require a current qualified human exclusion'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS exclusion_review_samples_source_idx
  ON public.exclusion_review_samples (sample_source, selected_at);

COMMENT ON COLUMN public.exclusion_review_samples.sample_source IS
  'Frozen sampled population: model presentation, deterministic scope exclusion, or current human exclusion.';
