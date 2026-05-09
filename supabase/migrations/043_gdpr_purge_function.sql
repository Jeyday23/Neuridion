-- GDPR Art. 17: allow service_role to delete from append-only tables
-- during account deletion. The DO INSTEAD NOTHING rules block normal
-- deletes; this function temporarily disables them.

CREATE OR REPLACE FUNCTION public.gdpr_purge_user_data(p_run_ids uuid[])
RETURNS void AS $$
BEGIN
  IF array_length(p_run_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.filter_decisions DISABLE RULE no_delete_filter_decisions;
  ALTER TABLE public.profile_edit_history DISABLE RULE prevent_profile_edit_history_delete;

  DELETE FROM public.filter_decisions WHERE search_run_id = ANY(p_run_ids);
  DELETE FROM public.profile_edit_history
    WHERE profile_id IN (
      SELECT DISTINCT profile_id FROM public.search_runs WHERE id = ANY(p_run_ids)
    );

  ALTER TABLE public.filter_decisions ENABLE RULE no_delete_filter_decisions;
  ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) TO service_role;
