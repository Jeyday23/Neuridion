-- Restrict purge_old_login_attempts to service_role only
-- (was callable by any authenticated user via PostgREST)
ALTER FUNCTION public.purge_old_login_attempts() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.purge_old_login_attempts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_old_login_attempts() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_login_attempts() FROM anon;
GRANT EXECUTE ON FUNCTION public.purge_old_login_attempts() TO service_role;

-- Restrict prevent_user_privilege_escalation trigger function
REVOKE EXECUTE ON FUNCTION public.prevent_user_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_user_privilege_escalation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_privilege_escalation() FROM anon;
GRANT EXECUTE ON FUNCTION public.prevent_user_privilege_escalation() TO service_role;
