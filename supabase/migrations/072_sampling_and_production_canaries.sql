-- Auditable exclusion sampling and production-parity synthetic canaries.
--
-- Sampling facts are selected and persisted before approval. The inclusion
-- probability is immutable because sampling rules evolve and cannot be used to
-- reconstruct old probabilities later.
--
-- Canaries execute through the ordinary production tenant/runtime path. A
-- Neuridion-owned synthetic profile is marked at the data boundary; RLS and
-- export guards guarantee that synthetic records cannot enter customer output.

ALTER TABLE public.product_profiles
  ADD COLUMN IF NOT EXISTS is_synthetic_canary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canary_key text;

ALTER TABLE public.product_profiles
  DROP CONSTRAINT IF EXISTS product_profiles_canary_identity_check;
ALTER TABLE public.product_profiles
  ADD CONSTRAINT product_profiles_canary_identity_check CHECK (
    (is_synthetic_canary = true
      AND canary_key ~ '^neuridion-canary-[a-z0-9][a-z0-9-]{2,63}$')
    OR
    (is_synthetic_canary = false AND canary_key IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS product_profiles_canary_key_uidx
  ON public.product_profiles (canary_key)
  WHERE is_synthetic_canary = true;

ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS is_synthetic_canary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canary_execution_id uuid;

ALTER TABLE public.search_runs
  DROP CONSTRAINT IF EXISTS search_runs_canary_execution_check;
ALTER TABLE public.search_runs
  ADD CONSTRAINT search_runs_canary_execution_check CHECK (
    is_synthetic_canary = (canary_execution_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.derive_search_run_canary_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_is_canary boolean;
BEGIN
  SELECT p.is_synthetic_canary
    INTO profile_is_canary
    FROM public.product_profiles p
    WHERE p.id = NEW.profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Search run profile does not exist' USING ERRCODE = '23503';
  END IF;

  NEW.is_synthetic_canary := profile_is_canary;
  IF profile_is_canary THEN
    NEW.canary_execution_id := COALESCE(NEW.canary_execution_id, gen_random_uuid());
  ELSE
    NEW.canary_execution_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_search_runs_derive_canary_scope ON public.search_runs;
CREATE TRIGGER trg_search_runs_derive_canary_scope
  BEFORE INSERT OR UPDATE OF profile_id, is_synthetic_canary, canary_execution_id
  ON public.search_runs
  FOR EACH ROW EXECUTE FUNCTION public.derive_search_run_canary_scope();

-- Customers cannot create, discover or mutate synthetic profiles/runs. Service
-- role remains the only writer for the internal validation profile.
DROP POLICY IF EXISTS "profiles: select own" ON public.product_profiles;
DROP POLICY IF EXISTS "profiles: insert own" ON public.product_profiles;
DROP POLICY IF EXISTS "profiles: update own" ON public.product_profiles;
DROP POLICY IF EXISTS "profiles: delete own" ON public.product_profiles;
CREATE POLICY "profiles: select own" ON public.product_profiles FOR SELECT
  USING (auth.uid() = user_id AND is_synthetic_canary = false);
CREATE POLICY "profiles: insert own" ON public.product_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_synthetic_canary = false AND canary_key IS NULL);
CREATE POLICY "profiles: update own" ON public.product_profiles FOR UPDATE
  USING (auth.uid() = user_id AND is_synthetic_canary = false)
  WITH CHECK (auth.uid() = user_id AND is_synthetic_canary = false AND canary_key IS NULL);
CREATE POLICY "profiles: delete own" ON public.product_profiles FOR DELETE
  USING (auth.uid() = user_id AND is_synthetic_canary = false);

-- PostgreSQL combines permissive policies with OR. Keep a restrictive marker
-- policy as the fail-closed boundary even if a legacy or future ownership
-- policy is also present under another name.
DROP POLICY IF EXISTS "profiles: synthetic canary isolation" ON public.product_profiles;
CREATE POLICY "profiles: synthetic canary isolation"
  ON public.product_profiles AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (is_synthetic_canary = false)
  WITH CHECK (is_synthetic_canary = false AND canary_key IS NULL);

DROP POLICY IF EXISTS "search_runs: select own" ON public.search_runs;
DROP POLICY IF EXISTS "search_runs: insert own" ON public.search_runs;
DROP POLICY IF EXISTS "search_runs: update own" ON public.search_runs;
DROP POLICY IF EXISTS "Users can delete own runs" ON public.search_runs;
CREATE POLICY "search_runs: select own" ON public.search_runs FOR SELECT
  USING (auth.uid() = user_id AND is_synthetic_canary = false);
CREATE POLICY "search_runs: insert own" ON public.search_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_synthetic_canary = false AND canary_execution_id IS NULL);
CREATE POLICY "search_runs: update own" ON public.search_runs FOR UPDATE
  USING (auth.uid() = user_id AND is_synthetic_canary = false)
  WITH CHECK (auth.uid() = user_id AND is_synthetic_canary = false AND canary_execution_id IS NULL);
CREATE POLICY "Users can delete own runs" ON public.search_runs FOR DELETE
  USING (auth.uid() = user_id AND is_synthetic_canary = false);

DROP POLICY IF EXISTS "search_runs: synthetic canary isolation" ON public.search_runs;
CREATE POLICY "search_runs: synthetic canary isolation"
  ON public.search_runs AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (is_synthetic_canary = false)
  WITH CHECK (is_synthetic_canary = false AND canary_execution_id IS NULL);

DROP POLICY IF EXISTS "fsn_results: select own" ON public.fsn_results;
DROP POLICY IF EXISTS "fsn_results: insert own" ON public.fsn_results;
CREATE POLICY "fsn_results: select own" ON public.fsn_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = run_id
      AND sr.user_id = auth.uid()
      AND sr.is_synthetic_canary = false
  ));
CREATE POLICY "fsn_results: insert own" ON public.fsn_results FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = run_id
      AND sr.user_id = auth.uid()
      AND sr.is_synthetic_canary = false
  ));

DROP POLICY IF EXISTS "fsn_results: synthetic canary isolation" ON public.fsn_results;
CREATE POLICY "fsn_results: synthetic canary isolation"
  ON public.fsn_results AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = run_id AND sr.is_synthetic_canary = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = run_id AND sr.is_synthetic_canary = false
  ));

DROP POLICY IF EXISTS "filter_decisions: select own" ON public.filter_decisions;
DROP POLICY IF EXISTS "filter_decisions: insert own" ON public.filter_decisions;
CREATE POLICY "filter_decisions: select own" ON public.filter_decisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = search_run_id
      AND sr.user_id = auth.uid()
      AND sr.is_synthetic_canary = false
  ));
CREATE POLICY "filter_decisions: insert own" ON public.filter_decisions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = search_run_id
      AND sr.user_id = auth.uid()
      AND sr.is_synthetic_canary = false
  ));

DROP POLICY IF EXISTS "filter_decisions: synthetic canary isolation" ON public.filter_decisions;
CREATE POLICY "filter_decisions: synthetic canary isolation"
  ON public.filter_decisions AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = search_run_id AND sr.is_synthetic_canary = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = search_run_id AND sr.is_synthetic_canary = false
  ));

DROP POLICY IF EXISTS "reports: own" ON public.reports;
CREATE POLICY "reports: own" ON public.reports FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.search_runs sr
      WHERE sr.id = run_id
        AND sr.user_id = auth.uid()
        AND sr.is_synthetic_canary = false
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.search_runs sr
      WHERE sr.id = run_id
        AND sr.user_id = auth.uid()
      AND sr.is_synthetic_canary = false
    )
  );

DROP POLICY IF EXISTS "reports: synthetic canary isolation" ON public.reports;
CREATE POLICY "reports: synthetic canary isolation"
  ON public.reports AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = run_id AND sr.is_synthetic_canary = false
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = run_id AND sr.is_synthetic_canary = false
  ));

CREATE TABLE public.exclusion_review_samples (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_run_id           uuid NOT NULL REFERENCES public.search_runs(id),
  fsn_result_id           uuid NOT NULL REFERENCES public.fsn_results(id),
  filter_decision_id      uuid NOT NULL REFERENCES public.filter_decisions(id),
  policy_version          text NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$'),
  inclusion_probability   numeric(12,11) NOT NULL CHECK (
                            inclusion_probability > 0 AND inclusion_probability <= 1
                          ),
  stratum                 jsonb NOT NULL CHECK (jsonb_typeof(stratum) = 'object'),
  eligible_arms           text[] NOT NULL CHECK (
                            cardinality(eligible_arms) > 0
                            AND eligible_arms <@ ARRAY['uniform_control', 'boundary', 'disagreement']::text[]
                          ),
  selected_by_arms        text[] NOT NULL CHECK (
                            cardinality(selected_by_arms) > 0
                            AND selected_by_arms <@ ARRAY['uniform_control', 'boundary', 'disagreement']::text[]
                            AND selected_by_arms <@ eligible_arms
                          ),
  selection_reason        text NOT NULL,
  draw_identifier         text NOT NULL CHECK (draw_identifier ~ '^[0-9a-f]{64}$'),
  draw_seed               text NOT NULL CHECK (char_length(draw_seed) BETWEEN 1 AND 256),
  seed_hash               text NOT NULL CHECK (seed_hash ~ '^[0-9a-f]{64}$'),
  policy_snapshot         jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  selection_context       jsonb NOT NULL CHECK (jsonb_typeof(selection_context) = 'object'),
  selected_at             timestamptz NOT NULL,
  UNIQUE (filter_decision_id, policy_version)
);

CREATE INDEX exclusion_review_samples_run_idx
  ON public.exclusion_review_samples (search_run_id, selected_at);
CREATE INDEX exclusion_review_samples_stratum_idx
  ON public.exclusion_review_samples USING gin (stratum);

CREATE OR REPLACE FUNCTION public.validate_exclusion_review_sample()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  linked_decision public.filter_decisions%ROWTYPE;
  linked_result public.fsn_results%ROWTYPE;
BEGIN
  SELECT * INTO linked_decision
  FROM public.filter_decisions
  WHERE id = NEW.filter_decision_id;

  IF NOT FOUND OR linked_decision.decision <> 'excluded' THEN
    RAISE EXCEPTION 'Exclusion sample must reference an excluded filter decision'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO linked_result
  FROM public.fsn_results
  WHERE id = NEW.fsn_result_id;

  IF NOT FOUND
     OR linked_decision.fsn_result_id <> NEW.fsn_result_id
     OR linked_decision.search_run_id <> NEW.search_run_id
     OR linked_result.run_id <> NEW.search_run_id THEN
    RAISE EXCEPTION 'Exclusion sample references do not belong to the same search run'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_exclusion_review_samples_validate
  BEFORE INSERT ON public.exclusion_review_samples
  FOR EACH ROW EXECUTE FUNCTION public.validate_exclusion_review_sample();

CREATE TRIGGER trg_exclusion_review_samples_append_only
  BEFORE UPDATE OR DELETE ON public.exclusion_review_samples
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE OR REPLACE FUNCTION public.create_sample_review_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.review_requirements (
    search_run_id, fsn_result_id, filter_decision_id, requirement_reason,
    blind_review_required, blind_policy_version, blind_inclusion_probability,
    source_reference_id, created_by
  ) VALUES (
    NEW.search_run_id, NEW.fsn_result_id, NEW.filter_decision_id, 'sampled_exclusion',
    (pg_catalog.hashtextextended(NEW.filter_decision_id::text || ':blind-first-v1', 0) & 65535) < 9830,
    CASE WHEN (
      pg_catalog.hashtextextended(NEW.filter_decision_id::text || ':blind-first-v1', 0) & 65535
    ) < 9830 THEN 'blind-first-v1' ELSE NULL END,
    CASE WHEN (
      pg_catalog.hashtextextended(NEW.filter_decision_id::text || ':blind-first-v1', 0) & 65535
    ) < 9830 THEN 0.15 ELSE NULL END,
    NEW.id, NULL
  )
  ON CONFLICT (filter_decision_id, requirement_reason) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_exclusion_review_samples_requirement
  AFTER INSERT ON public.exclusion_review_samples
  FOR EACH ROW EXECUTE FUNCTION public.create_sample_review_requirement();

CREATE OR REPLACE FUNCTION public.prevent_canary_report_output()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = NEW.run_id AND sr.is_synthetic_canary = true
  ) THEN
    RAISE EXCEPTION 'Synthetic canary runs cannot produce customer reports'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_reject_synthetic_canary
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_canary_report_output();

CREATE OR REPLACE FUNCTION public.prevent_canary_report_paths()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_synthetic_canary = true AND (
    NEW.report_html_path IS NOT NULL
    OR NEW.report_pdf_path IS NOT NULL
    OR NEW.report_excel_path IS NOT NULL
    OR NEW.report_docx_path IS NOT NULL
    OR NEW.report_generated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Synthetic canary runs cannot store customer report output'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_search_runs_reject_canary_report_paths
  BEFORE INSERT OR UPDATE OF report_html_path, report_pdf_path, report_excel_path,
    report_docx_path, report_generated_at
  ON public.search_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_canary_report_paths();

ALTER TABLE public.exclusion_review_samples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exclusion_review_samples FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.exclusion_review_samples TO service_role;

REVOKE ALL ON FUNCTION public.derive_search_run_canary_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_exclusion_review_sample() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sample_review_requirement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_canary_report_output() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_canary_report_paths() FROM PUBLIC;

COMMENT ON TABLE public.exclusion_review_samples IS
  'Immutable sampling facts for AI-excluded records, including inclusion probability at selection time.';
COMMENT ON COLUMN public.exclusion_review_samples.inclusion_probability IS
  'Probability of selection by any eligible arm under the frozen policy snapshot; never reconstructed later.';
COMMENT ON COLUMN public.exclusion_review_samples.draw_seed IS
  'Exact non-secret seed used at draw time. Stored with the draw rather than reconstructed from later sampling rules.';
COMMENT ON COLUMN public.product_profiles.is_synthetic_canary IS
  'Service-role-only Neuridion validation profile marker; excluded from every customer data scope.';
