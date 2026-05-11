-- Fix: add advisory lock to gdpr_purge_user_data to prevent concurrent
-- service-role operations from bypassing append-only rules while they're disabled.
-- Also drop the stale uuid[] overload from migration 043.

CREATE OR REPLACE FUNCTION public.gdpr_purge_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Prevent concurrent purges or any other operation that checks append-only rules
  PERFORM pg_advisory_xact_lock(hashtext('gdpr_purge:' || target_user_id::text));

  ALTER TABLE public.filter_decisions DISABLE RULE no_delete_filter_decisions;
  ALTER TABLE public.profile_edit_history DISABLE RULE prevent_profile_edit_history_delete;

  BEGIN
    DELETE FROM public.filter_decisions
      WHERE search_run_id IN (SELECT id FROM public.search_runs WHERE user_id = target_user_id);

    DELETE FROM public.profile_edit_history
      WHERE profile_id IN (SELECT id FROM public.product_profiles WHERE user_id = target_user_id);

    DELETE FROM public.search_runs WHERE user_id = target_user_id;
    DELETE FROM public.product_profiles WHERE user_id = target_user_id;
    DELETE FROM public.search_drafts WHERE user_id = target_user_id;
    DELETE FROM public.reports WHERE user_id = target_user_id;
    DELETE FROM public.user_feedback WHERE user_id = target_user_id;

    UPDATE public.users SET
      full_name = 'Deleted User',
      company_name = NULL,
      deleted_at = now()
    WHERE id = target_user_id;

  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.filter_decisions ENABLE RULE no_delete_filter_decisions;
    ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
    RAISE;
  END;

  ALTER TABLE public.filter_decisions ENABLE RULE no_delete_filter_decisions;
  ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_purge_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gdpr_purge_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid) TO service_role;

-- Drop stale uuid[] overload from migration 043 (Fix #6)
DROP FUNCTION IF EXISTS public.gdpr_purge_user_data(uuid[]);
