-- Deploy before application code. Replaces the existing readiness RPC without
-- changing its signature; older application versions receive the stricter gate.
-- Parent-row locks serialize evidence writes with approval. VOLATILE readiness
-- takes fresh snapshots after a lock wait instead of reusing the UPDATE snapshot.
CREATE OR REPLACE FUNCTION public.is_search_run_adjudication_complete(target_run_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.search_runs sr
    WHERE sr.id = target_run_id
      AND sr.status IN ('complete', 'degraded')
      AND sr.completed_at IS NOT NULL
      AND sr.deleted_at IS NULL
      AND NOT sr.is_synthetic_canary
      AND sr.total_scraped = (SELECT count(*) FROM public.fsn_results fr WHERE fr.run_id = sr.id)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.fsn_results fr
    LEFT JOIN LATERAL (
      SELECT fd.id, fd.decision FROM public.filter_decisions fd
      WHERE fd.fsn_result_id = fr.id
        AND (fd.search_run_id IS NULL OR fd.search_run_id = target_run_id)
      ORDER BY fd.decided_at DESC, fd.id DESC LIMIT 1
    ) decision ON true
    LEFT JOIN LATERAL (
      SELECT he.* FROM public.human_adjudication_events he
      WHERE he.search_run_id = target_run_id AND he.fsn_result_id = fr.id
        AND he.phase = 'final'
        AND NOT EXISTS (
          SELECT 1 FROM public.human_adjudication_events successor
          WHERE successor.supersedes_event_id = he.id
        )
      ORDER BY he.created_at DESC, he.id DESC LIMIT 1
    ) final_event ON true
    LEFT JOIN LATERAL (
      SELECT he.disposition FROM public.human_adjudication_events he
      WHERE he.phase = 'second_review' AND he.review_of_event_id = final_event.id
        AND he.reviewer_id <> final_event.reviewer_id
      ORDER BY he.created_at DESC, he.id DESC LIMIT 1
    ) second_review ON true
    WHERE fr.run_id = target_run_id AND (
      decision.id IS NULL
      OR (
        (decision.decision <> 'excluded' OR EXISTS (
          SELECT 1 FROM public.review_requirements rr
          WHERE rr.search_run_id = target_run_id AND rr.fsn_result_id = fr.id
        ) OR final_event.id IS NOT NULL)
        AND (
          final_event.id IS NULL
          OR final_event.filter_decision_id IS DISTINCT FROM decision.id
          OR (final_event.requires_second_review
            AND second_review.disposition IS DISTINCT FROM final_event.disposition)
        )
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.is_search_run_adjudication_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_search_run_adjudication_complete(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_search_run_adjudication_gate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.review_status IN ('reviewed', 'approved') THEN
      RAISE EXCEPTION 'New searches must start without approval' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- Report locations and soft deletion are operational metadata. All approved
  -- evidence, scope, counts and attribution are frozen; corrections need a new run.
  IF OLD.review_status = 'approved' AND
    (to_jsonb(NEW) - ARRAY['report_html_path','report_pdf_path','report_excel_path','report_docx_path','report_generated_at','deleted_at'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['report_html_path','report_pdf_path','report_excel_path','report_docx_path','report_generated_at','deleted_at']) THEN
    RAISE EXCEPTION 'Approved search evidence is immutable; create a new search for corrections'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.review_status IN ('reviewed', 'approved') AND OLD.review_status IS DISTINCT FROM NEW.review_status THEN
    IF NEW.status NOT IN ('complete', 'degraded') OR NEW.completed_at IS NULL OR NEW.deleted_at IS NOT NULL
      OR NEW.is_synthetic_canary THEN
      RAISE EXCEPTION 'Search must be completed before review or approval' USING ERRCODE = '23514';
    END IF;
    IF NEW.review_status = 'approved' AND (
      OLD.review_status IS DISTINCT FROM 'reviewed'
      OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
      OR NOT public.is_search_run_adjudication_complete(NEW.id)
    ) THEN
      RAISE EXCEPTION 'Search run has unresolved record-level adjudications' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_search_run_adjudication_gate ON public.search_runs;
CREATE TRIGGER trg_search_run_adjudication_gate BEFORE INSERT OR UPDATE ON public.search_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_search_run_adjudication_gate();

CREATE OR REPLACE FUNCTION public.lock_unapproved_run_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  target_run uuid;
  previous_run uuid;
  review_state text;
BEGIN
  IF TG_TABLE_NAME = 'fsn_results' THEN
    target_run := CASE WHEN TG_OP = 'DELETE' THEN OLD.run_id ELSE NEW.run_id END;
    IF TG_OP = 'UPDATE' THEN previous_run := OLD.run_id; END IF;
  ELSIF TG_TABLE_NAME = 'filter_decisions' THEN
    SELECT fr.run_id INTO target_run FROM public.fsn_results fr WHERE fr.id = NEW.fsn_result_id;
    IF NEW.search_run_id IS NOT NULL AND NEW.search_run_id IS DISTINCT FROM target_run THEN
      RAISE EXCEPTION 'Decision and result must belong to the same run' USING ERRCODE = '23514';
    END IF;
  ELSE
    target_run := NEW.search_run_id;
  END IF;
  IF previous_run IS NOT NULL AND previous_run IS DISTINCT FROM target_run THEN
    RAISE EXCEPTION 'Cannot move evidence between runs' USING ERRCODE = '23514';
  END IF;
  SELECT sr.review_status INTO review_state FROM public.search_runs sr
    WHERE sr.id = target_run FOR UPDATE;
  IF NOT FOUND OR review_state = 'approved' THEN
    RAISE EXCEPTION 'Cannot change evidence after run approval' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fsn_results_approval_lock BEFORE INSERT OR UPDATE OR DELETE ON public.fsn_results
  FOR EACH ROW EXECUTE FUNCTION public.lock_unapproved_run_evidence();
CREATE TRIGGER trg_filter_decisions_approval_lock BEFORE INSERT ON public.filter_decisions
  FOR EACH ROW EXECUTE FUNCTION public.lock_unapproved_run_evidence();
CREATE TRIGGER trg_human_adjudications_approval_lock BEFORE INSERT ON public.human_adjudication_events
  FOR EACH ROW EXECUTE FUNCTION public.lock_unapproved_run_evidence();
CREATE TRIGGER trg_review_requirements_approval_lock BEFORE INSERT ON public.review_requirements
  FOR EACH ROW EXECUTE FUNCTION public.lock_unapproved_run_evidence();
CREATE TRIGGER trg_review_samples_approval_lock BEFORE INSERT ON public.exclusion_review_samples
  FOR EACH ROW EXECUTE FUNCTION public.lock_unapproved_run_evidence();

REVOKE ALL ON FUNCTION public.lock_unapproved_run_evidence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_search_run_adjudication_gate() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.neuridion_release_schema_version()
RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT 74 $$;
REVOKE ALL ON FUNCTION public.neuridion_release_schema_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neuridion_release_schema_version() TO service_role;
