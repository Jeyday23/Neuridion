-- Migration 035: Harden SECURITY DEFINER functions
-- Restrict EXECUTE permissions to service_role only and set safe search_path
-- Prevents authenticated users from directly calling privileged functions

-- 1. increment_pdf_usage: was callable by any authenticated user (quota exhaustion attack)
ALTER FUNCTION public.increment_pdf_usage(uuid, text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.increment_pdf_usage(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_pdf_usage(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_pdf_usage(uuid, text) TO service_role;

-- 2. merge_coverage_for_source: was explicitly GRANTed to authenticated (coverage data manipulation)
ALTER FUNCTION public.merge_coverage_for_source(text, date, date) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.merge_coverage_for_source(text, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_coverage_for_source(text, date, date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.merge_coverage_for_source(text, date, date) TO service_role;

-- 3. claim_next_job: was callable by any authenticated user (job queue theft)
ALTER FUNCTION public.claim_next_job(text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.claim_next_job(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_next_job(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_next_job(text) TO service_role;

-- 4. requeue_stale_jobs: was callable by any authenticated user (job disruption)
ALTER FUNCTION public.requeue_stale_jobs(integer) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.requeue_stale_jobs(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.requeue_stale_jobs(integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.requeue_stale_jobs(integer) TO service_role;

-- 5. handle_new_user: trigger function, low risk but should still be restricted
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
