-- Human adjudication and approval controls for PRRC-governed PMS review.
--
-- AI filter decisions remain immutable machine observations. Human conclusions
-- are appended separately so that a later correction never overwrites what a
-- reviewer originally saw or decided.

CREATE TABLE public.run_reviewer_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_run_id     uuid NOT NULL REFERENCES public.search_runs(id),
  reviewer_id       uuid NOT NULL REFERENCES public.users(id),
  assigned_by       uuid NOT NULL REFERENCES public.users(id),
  assignment_role   text NOT NULL CHECK (assignment_role IN ('primary', 'secondary', 'both')),
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_run_id, reviewer_id)
);

CREATE INDEX run_reviewer_assignments_reviewer_idx
  ON public.run_reviewer_assignments (reviewer_id, search_run_id);

CREATE TABLE public.review_requirements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_run_id         uuid NOT NULL REFERENCES public.search_runs(id),
  fsn_result_id         uuid NOT NULL REFERENCES public.fsn_results(id),
  filter_decision_id    uuid NOT NULL REFERENCES public.filter_decisions(id),
  requirement_reason    text NOT NULL CHECK (requirement_reason IN (
                            'ai_relevant', 'ai_uncertain', 'ai_filter_failed',
                            'sampled_exclusion', 'blind_validation'
                          )),
  blind_review_required boolean NOT NULL DEFAULT false,
  blind_policy_version  text,
  blind_inclusion_probability numeric(12,11),
  source_reference_id   uuid,
  created_by            uuid REFERENCES public.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filter_decision_id, requirement_reason),
  CHECK (
    (blind_review_required = true
      AND blind_policy_version IS NOT NULL
      AND blind_inclusion_probability > 0
      AND blind_inclusion_probability <= 1)
    OR
    (blind_review_required = false
      AND blind_policy_version IS NULL
      AND blind_inclusion_probability IS NULL)
  )
);

CREATE INDEX review_requirements_run_result_idx
  ON public.review_requirements (search_run_id, fsn_result_id);

CREATE TABLE public.human_adjudication_events (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_run_id                   uuid NOT NULL REFERENCES public.search_runs(id),
  fsn_result_id                   uuid NOT NULL REFERENCES public.fsn_results(id),
  filter_decision_id              uuid NOT NULL REFERENCES public.filter_decisions(id),
  reviewer_id                     uuid NOT NULL REFERENCES public.users(id),
  phase                           text NOT NULL CHECK (phase IN (
                                      'provisional_blind', 'final', 'second_review'
                                    )),
  disposition                     text NOT NULL CHECK (disposition IN (
                                      'relevant', 'uncertain', 'excluded'
                                    )),
  confidence                      smallint CHECK (confidence BETWEEN 1 AND 5),
  rationale                       text NOT NULL CHECK (char_length(btrim(rationale)) >= 3),
  reviewer_role                   text NOT NULL CHECK (reviewer_role IN (
                                      'prrc', 'regulatory_affairs', 'quality_assurance',
                                      'clinical', 'other'
                                    )),
  qualification_attestation       text NOT NULL
                                    CHECK (char_length(btrim(qualification_attestation)) >= 10),
  attests_qualified               boolean NOT NULL CHECK (attests_qualified),
  blind_to_ai                     boolean NOT NULL DEFAULT false,
  provisional_event_id            uuid REFERENCES public.human_adjudication_events(id),
  supersedes_event_id             uuid REFERENCES public.human_adjudication_events(id),
  review_of_event_id              uuid REFERENCES public.human_adjudication_events(id),
  requires_second_review          boolean NOT NULL DEFAULT false,
  material_change                 boolean NOT NULL DEFAULT false,
  serious_event_signal            boolean NOT NULL DEFAULT false,
  ai_model_snapshot               text,
  ai_prompt_version_snapshot      text,
  authority_revision_id           uuid REFERENCES public.authority_record_revisions(id),
  evidence_parser_version_snapshot text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  CHECK (phase <> 'provisional_blind' OR (blind_to_ai AND confidence IS NOT NULL)),
  CHECK (phase <> 'final' OR review_of_event_id IS NULL),
  CHECK (phase <> 'second_review' OR review_of_event_id IS NOT NULL),
  CHECK (phase = 'final' OR supersedes_event_id IS NULL)
);

CREATE INDEX human_adjudication_events_run_result_idx
  ON public.human_adjudication_events (search_run_id, fsn_result_id, created_at);

CREATE UNIQUE INDEX human_adjudication_one_blind_event_per_reviewer_idx
  ON public.human_adjudication_events (fsn_result_id, reviewer_id)
  WHERE phase = 'provisional_blind';

CREATE UNIQUE INDEX human_adjudication_one_successor_idx
  ON public.human_adjudication_events (supersedes_event_id)
  WHERE supersedes_event_id IS NOT NULL;

CREATE UNIQUE INDEX human_adjudication_one_second_review_per_reviewer_idx
  ON public.human_adjudication_events (review_of_event_id, reviewer_id)
  WHERE phase = 'second_review';

-- Validate cross-row invariants that CHECK constraints cannot express.
CREATE OR REPLACE FUNCTION public.validate_human_adjudication_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  linked_run_id uuid;
  decision_run_id uuid;
  linked_phase text;
  linked_result_id uuid;
  linked_reviewer_id uuid;
BEGIN
  SELECT fr.run_id INTO linked_run_id
    FROM public.fsn_results fr
    WHERE fr.id = NEW.fsn_result_id;

  IF linked_run_id IS DISTINCT FROM NEW.search_run_id THEN
    RAISE EXCEPTION 'FSN result does not belong to the adjudicated search run'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(fd.search_run_id, linked_run_id)
    INTO decision_run_id
    FROM public.filter_decisions fd
    WHERE fd.id = NEW.filter_decision_id
      AND fd.fsn_result_id = NEW.fsn_result_id;

  IF decision_run_id IS NULL OR decision_run_id IS DISTINCT FROM NEW.search_run_id THEN
    RAISE EXCEPTION 'Filter decision does not belong to the adjudicated record'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.provisional_event_id IS NOT NULL THEN
    SELECT phase, fsn_result_id, reviewer_id
      INTO linked_phase, linked_result_id, linked_reviewer_id
      FROM public.human_adjudication_events
      WHERE id = NEW.provisional_event_id;

    IF linked_phase IS DISTINCT FROM 'provisional_blind'
       OR linked_result_id IS DISTINCT FROM NEW.fsn_result_id
       OR linked_reviewer_id IS DISTINCT FROM NEW.reviewer_id THEN
      RAISE EXCEPTION 'Provisional event must be a blind decision by the same reviewer for this record'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.supersedes_event_id IS NOT NULL THEN
    SELECT phase, fsn_result_id, reviewer_id
      INTO linked_phase, linked_result_id, linked_reviewer_id
      FROM public.human_adjudication_events
      WHERE id = NEW.supersedes_event_id;

    IF linked_phase IS DISTINCT FROM 'final'
       OR linked_result_id IS DISTINCT FROM NEW.fsn_result_id
       OR linked_reviewer_id IS DISTINCT FROM NEW.reviewer_id THEN
      RAISE EXCEPTION 'A final correction must supersede the same reviewer''s final decision for this record'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.phase = 'second_review' THEN
    SELECT phase, fsn_result_id, reviewer_id
      INTO linked_phase, linked_result_id, linked_reviewer_id
      FROM public.human_adjudication_events
      WHERE id = NEW.review_of_event_id;

    IF linked_phase IS DISTINCT FROM 'final'
       OR linked_result_id IS DISTINCT FROM NEW.fsn_result_id
       OR linked_reviewer_id = NEW.reviewer_id THEN
      RAISE EXCEPTION 'Second review must reference another reviewer''s final decision for this record'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.phase = 'final'
     AND EXISTS (
       SELECT 1 FROM public.review_requirements rr
       WHERE rr.fsn_result_id = NEW.fsn_result_id
         AND rr.blind_review_required
     )
     AND NEW.provisional_event_id IS NULL THEN
    RAISE EXCEPTION 'A blind provisional disposition is required before the final decision'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_human_adjudication_event
  BEFORE INSERT ON public.human_adjudication_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_human_adjudication_event();

-- All review evidence is immutable. Corrections are new final events linked by
-- supersedes_event_id; earlier events remain independently auditable.
CREATE TRIGGER trg_run_reviewer_assignments_append_only
  BEFORE UPDATE OR DELETE ON public.run_reviewer_assignments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER trg_review_requirements_append_only
  BEFORE UPDATE OR DELETE ON public.review_requirements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER trg_human_adjudication_events_append_only
  BEFORE UPDATE OR DELETE ON public.human_adjudication_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

-- Every non-excluded AI outcome is review-blocking. A later sampling migration
-- can append sampled_exclusion requirements without changing this table.
CREATE OR REPLACE FUNCTION public.create_ai_review_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  resolved_run_id uuid;
  resolved_reason text;
  blind_selected boolean;
BEGIN
  IF NEW.decision NOT IN ('relevant', 'uncertain', 'filter_failed') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NEW.search_run_id, fr.run_id)
    INTO resolved_run_id
    FROM public.fsn_results fr
    WHERE fr.id = NEW.fsn_result_id;

  resolved_reason := CASE NEW.decision
    WHEN 'relevant' THEN 'ai_relevant'
    WHEN 'uncertain' THEN 'ai_uncertain'
    ELSE 'ai_filter_failed'
  END;

  -- Pre-registered blind-first-v1 arm. The first 16 digest bits provide a
  -- deterministic uniform draw; 9830 / 65536 is approximately 15%.
  blind_selected := (
    pg_catalog.hashtextextended(NEW.id::text || ':blind-first-v1', 0) & 65535
  ) < 9830;

  INSERT INTO public.review_requirements (
    search_run_id, fsn_result_id, filter_decision_id, requirement_reason,
    blind_review_required, blind_policy_version, blind_inclusion_probability
  ) VALUES (
    resolved_run_id, NEW.fsn_result_id, NEW.id, resolved_reason,
    blind_selected,
    CASE WHEN blind_selected THEN 'blind-first-v1' ELSE NULL END,
    CASE WHEN blind_selected THEN 0.15 ELSE NULL END
  ) ON CONFLICT (filter_decision_id, requirement_reason) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_filter_decision_review_requirement
  AFTER INSERT ON public.filter_decisions
  FOR EACH ROW EXECUTE FUNCTION public.create_ai_review_requirement();

INSERT INTO public.review_requirements (
  search_run_id, fsn_result_id, filter_decision_id, requirement_reason,
  blind_review_required, blind_policy_version, blind_inclusion_probability
)
SELECT
  COALESCE(fd.search_run_id, fr.run_id),
  fd.fsn_result_id,
  fd.id,
  CASE fd.decision
    WHEN 'relevant' THEN 'ai_relevant'
    WHEN 'uncertain' THEN 'ai_uncertain'
    ELSE 'ai_filter_failed'
  END,
  (pg_catalog.hashtextextended(fd.id::text || ':blind-first-v1', 0) & 65535) < 9830,
  CASE WHEN (
    pg_catalog.hashtextextended(fd.id::text || ':blind-first-v1', 0) & 65535
  ) < 9830 THEN 'blind-first-v1' ELSE NULL END,
  CASE WHEN (
    pg_catalog.hashtextextended(fd.id::text || ':blind-first-v1', 0) & 65535
  ) < 9830 THEN 0.15 ELSE NULL END
FROM public.filter_decisions fd
JOIN public.fsn_results fr ON fr.id = fd.fsn_result_id
WHERE fd.decision IN ('relevant', 'uncertain', 'filter_failed')
ON CONFLICT (filter_decision_id, requirement_reason) DO NOTHING;

-- Returns true only when every required record has a current final regulatory
-- decision and every required independent review confirms that decision.
CREATE OR REPLACE FUNCTION public.is_search_run_adjudication_complete(target_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT rr.fsn_result_id
      FROM public.review_requirements rr
      WHERE rr.search_run_id = target_run_id
    ) required
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.human_adjudication_events final_event
      WHERE final_event.search_run_id = target_run_id
        AND final_event.fsn_result_id = required.fsn_result_id
        AND final_event.phase = 'final'
        AND NOT EXISTS (
          SELECT 1
          FROM public.human_adjudication_events successor
          WHERE successor.supersedes_event_id = final_event.id
        )
        AND (
          NOT final_event.requires_second_review
          OR EXISTS (
            SELECT 1
            FROM public.human_adjudication_events second_review
            WHERE second_review.phase = 'second_review'
              AND second_review.review_of_event_id = final_event.id
              AND second_review.reviewer_id <> final_event.reviewer_id
              AND second_review.disposition = final_event.disposition
          )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_search_run_adjudication_complete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_search_run_adjudication_complete(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_search_run_adjudication_complete(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_search_run_adjudication_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.review_status = 'approved'
     AND OLD.review_status IS DISTINCT FROM 'approved'
     AND NOT public.is_search_run_adjudication_complete(NEW.id) THEN
    RAISE EXCEPTION 'Search run has unresolved record-level adjudications'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_search_run_adjudication_gate
  BEFORE UPDATE OF review_status ON public.search_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_search_run_adjudication_gate();

CREATE OR REPLACE FUNCTION public.prevent_late_review_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = NEW.search_run_id AND sr.review_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Cannot add a review requirement after run approval'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_late_review_requirement
  BEFORE INSERT ON public.review_requirements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_review_requirement();

ALTER TABLE public.run_reviewer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_adjudication_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.run_reviewer_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.review_requirements FROM anon, authenticated;
REVOKE ALL ON TABLE public.human_adjudication_events FROM anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.run_reviewer_assignments TO service_role;
GRANT SELECT, INSERT ON TABLE public.review_requirements TO service_role;
GRANT SELECT, INSERT ON TABLE public.human_adjudication_events TO service_role;

COMMENT ON TABLE public.human_adjudication_events IS
  'Immutable human PMS dispositions. Final corrections append a superseding event; they never rewrite history.';
COMMENT ON COLUMN public.human_adjudication_events.confidence IS
  'Reviewer confidence on a 1–5 ordinal scale; mandatory for provisional blind dispositions.';
COMMENT ON COLUMN public.human_adjudication_events.requires_second_review IS
  'Server-derived flag for serious or material downgrades; cannot be asserted away by the client.';
