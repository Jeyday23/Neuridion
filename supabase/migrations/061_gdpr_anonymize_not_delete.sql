-- EU MDR Art. 10(8) requires 10-year retention of post-market surveillance records.
-- GDPR Art. 17(3)(b) exempts erasure when retention is required by EU law.
-- Strategy: anonymize user PII, retain all PMS surveillance records.

CREATE OR REPLACE FUNCTION public.gdpr_purge_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gdpr_purge:' || target_user_id::text));

  -- ═══════════════════════════════════════════════════════════════════
  -- PMS RECORDS — RETAIN (EU MDR Art. 10(8), 10-year obligation)
  -- search_runs, fsn_results, filter_decisions, product_profiles,
  -- profile_edit_history, reports: kept intact for regulatory traceability.
  -- ═══════════════════════════════════════════════════════════════════

  -- Anonymize profile_edit_history author references
  ALTER TABLE public.profile_edit_history DISABLE RULE prevent_profile_edit_history_delete;
  BEGIN
    UPDATE public.profile_edit_history
      SET edited_by = '00000000-0000-0000-0000-000000000000'
      WHERE profile_id IN (SELECT id FROM public.product_profiles WHERE user_id = target_user_id);
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
    RAISE;
  END;
  ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;

  -- ═══════════════════════════════════════════════════════════════════
  -- PERSONAL DATA — DELETE (GDPR Art. 17)
  -- ═══════════════════════════════════════════════════════════════════

  DELETE FROM public.search_drafts WHERE user_id = target_user_id;
  DELETE FROM public.user_feedback WHERE user_id = target_user_id;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pdf_usage') THEN
    EXECUTE 'DELETE FROM public.pdf_usage WHERE user_id = $1' USING target_user_id;
  END IF;

  -- Trial system PII
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'used_trial_emails') THEN
    EXECUTE 'DELETE FROM public.used_trial_emails WHERE email = (SELECT email FROM auth.users WHERE id = $1)' USING target_user_id;
  END IF;

  UPDATE public.trial_codes
    SET redeemed_by_email = NULL, redeemed_by_user_id = NULL
    WHERE redeemed_by_user_id = target_user_id;

  -- ═══════════════════════════════════════════════════════════════════
  -- USER RECORD — ANONYMIZE (retain row for FK integrity)
  -- ═══════════════════════════════════════════════════════════════════

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
