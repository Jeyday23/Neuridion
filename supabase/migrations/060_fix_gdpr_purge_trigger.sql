-- Fix: gdpr_purge_user_data references RULE no_delete_filter_decisions which
-- was dropped in migration 050 and replaced by TRIGGER trg_prevent_filter_decisions_delete.
-- Also adds cleanup of used_trial_emails and trial_codes PII (GDPR erasure).
-- Uses EXECUTE for tables that may not exist yet (reports, used_trial_emails).

CREATE OR REPLACE FUNCTION public.gdpr_purge_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Prevent concurrent purges
  PERFORM pg_advisory_xact_lock(hashtext('gdpr_purge:' || target_user_id::text));

  -- Disable append-only protections for GDPR erasure
  ALTER TABLE public.filter_decisions DISABLE TRIGGER trg_prevent_filter_decisions_delete;
  ALTER TABLE public.profile_edit_history DISABLE RULE prevent_profile_edit_history_delete;

  BEGIN
    DELETE FROM public.filter_decisions
      WHERE search_run_id IN (SELECT id FROM public.search_runs WHERE user_id = target_user_id);

    DELETE FROM public.profile_edit_history
      WHERE profile_id IN (SELECT id FROM public.product_profiles WHERE user_id = target_user_id);

    DELETE FROM public.search_runs WHERE user_id = target_user_id;
    DELETE FROM public.product_profiles WHERE user_id = target_user_id;
    DELETE FROM public.search_drafts WHERE user_id = target_user_id;
    DELETE FROM public.user_feedback WHERE user_id = target_user_id;

    -- Tables that may not exist yet — use dynamic SQL
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reports') THEN
      EXECUTE 'DELETE FROM public.reports WHERE user_id = $1' USING target_user_id;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'used_trial_emails') THEN
      EXECUTE 'DELETE FROM public.used_trial_emails WHERE email = (SELECT email FROM auth.users WHERE id = $1)' USING target_user_id;
    END IF;

    UPDATE public.trial_codes
      SET redeemed_by_email = NULL, redeemed_by_user_id = NULL
      WHERE redeemed_by_user_id = target_user_id;

    UPDATE public.users SET
      full_name = 'Deleted User',
      company_name = NULL,
      deleted_at = now()
    WHERE id = target_user_id;

  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.filter_decisions ENABLE TRIGGER trg_prevent_filter_decisions_delete;
    ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
    RAISE;
  END;

  ALTER TABLE public.filter_decisions ENABLE TRIGGER trg_prevent_filter_decisions_delete;
  ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_purge_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gdpr_purge_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid) TO service_role;
