-- Privileged RPCs are server-only. Earlier migrations revoked PUBLIC and
-- authenticated, but an explicit anon grant survives a PUBLIC revoke.
-- All application callsites use createAdminClient/service_role; no customer
-- session RPC or GDPR purge implementation is changed here.

REVOKE EXECUTE ON FUNCTION public.check_and_insert_search_run(uuid, uuid, date, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_insert_search_run(uuid, uuid, date, date, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_next_job(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_job(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_pdf_usage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_pdf_usage(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.merge_coverage_for_source(text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_coverage_for_source(text, date, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.requeue_stale_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stale_jobs(integer) TO service_role;

-- Trigger execution is preserved. PostgreSQL checks EXECUTE when the trigger
-- is created, not against each user whose table statement fires the trigger.
REVOKE EXECUTE ON FUNCTION public.derive_search_run_canary_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_search_run_canary_scope() TO service_role;

-- This existing SECURITY INVOKER trigger only uses builtins and OLD/NEW.
-- Pin resolution without changing its privilege-escalation guard or grants.
ALTER FUNCTION public.prevent_user_privilege_escalation() SET search_path = '';

CREATE OR REPLACE FUNCTION public.neuridion_release_schema_version()
RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT 75 $$;
REVOKE ALL ON FUNCTION public.neuridion_release_schema_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neuridion_release_schema_version() TO service_role;
