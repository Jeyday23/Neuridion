-- Upgrade audit_log and profile_edit_history from DO INSTEAD NOTHING rules
-- to BEFORE triggers that RAISE EXCEPTION. Silent swallowing masked bugs
-- (e.g. cascade deletes silently losing rows). Error-raising triggers
-- match the pattern already used for filter_decisions (migration 050).

-- ═══════════════════════════════════════════════════════════════════════
-- audit_log — fully immutable, no GDPR exception needed
-- ═══════════════════════════════════════════════════════════════════════

DROP RULE IF EXISTS no_update_audit_log ON public.audit_log;
DROP RULE IF EXISTS no_delete_audit_log ON public.audit_log;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable — UPDATE is not permitted'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable — DELETE is not permitted'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_prevent_audit_log_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_update();

CREATE TRIGGER trg_prevent_audit_log_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_delete();

-- ═══════════════════════════════════════════════════════════════════════
-- profile_edit_history — immutable except during GDPR anonymization
-- ═══════════════════════════════════════════════════════════════════════

DROP RULE IF EXISTS prevent_profile_edit_history_update ON public.profile_edit_history;
DROP RULE IF EXISTS prevent_profile_edit_history_delete ON public.profile_edit_history;

CREATE OR REPLACE FUNCTION public.prevent_profile_edit_history_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'profile_edit_history is append-only — UPDATE is not permitted outside GDPR purge'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_edit_history_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'profile_edit_history is append-only — DELETE is not permitted outside GDPR purge'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_prevent_profile_edit_history_update
  BEFORE UPDATE ON public.profile_edit_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_edit_history_update();

CREATE TRIGGER trg_prevent_profile_edit_history_delete
  BEFORE DELETE ON public.profile_edit_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_edit_history_delete();

-- ═══════════════════════════════════════════════════════════════════════
-- Update gdpr_purge_user_data to use DISABLE/ENABLE TRIGGER instead of RULE
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gdpr_purge_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gdpr_purge:' || target_user_id::text));

  -- PMS RECORDS — RETAIN (EU MDR Art. 10(8), 10-year obligation)
  -- search_runs, fsn_results, filter_decisions, product_profiles,
  -- profile_edit_history, reports: kept intact for regulatory traceability.

  -- Anonymize profile_edit_history author references
  ALTER TABLE public.profile_edit_history DISABLE TRIGGER trg_prevent_profile_edit_history_update;
  BEGIN
    UPDATE public.profile_edit_history
      SET edited_by = '00000000-0000-0000-0000-000000000000'
      WHERE profile_id IN (SELECT id FROM public.product_profiles WHERE user_id = target_user_id);
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.profile_edit_history ENABLE TRIGGER trg_prevent_profile_edit_history_update;
    RAISE;
  END;
  ALTER TABLE public.profile_edit_history ENABLE TRIGGER trg_prevent_profile_edit_history_update;

  -- PERSONAL DATA — DELETE (GDPR Art. 17)
  DELETE FROM public.search_drafts WHERE user_id = target_user_id;
  DELETE FROM public.user_feedback WHERE user_id = target_user_id;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pdf_usage') THEN
    EXECUTE 'DELETE FROM public.pdf_usage WHERE user_id = $1' USING target_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'used_trial_emails') THEN
    EXECUTE 'DELETE FROM public.used_trial_emails WHERE email = (SELECT email FROM auth.users WHERE id = $1)' USING target_user_id;
  END IF;

  UPDATE public.trial_codes
    SET redeemed_by_email = NULL, redeemed_by_user_id = NULL
    WHERE redeemed_by_user_id = target_user_id;

  -- USER RECORD — ANONYMIZE (retain row for FK integrity)
  UPDATE public.users SET
    full_name     = 'Deleted User',
    email         = 'deleted-' || target_user_id::text || '@anonymized.local',
    company_name  = NULL,
    deleted_at    = now()
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_purge_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gdpr_purge_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid) TO service_role;
