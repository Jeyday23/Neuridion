-- Atomic plan-limit check: returns current count while holding a row-level
-- advisory lock on the user, preventing concurrent requests from both passing.
CREATE OR REPLACE FUNCTION public.check_and_insert_search_run(
  p_user_id    uuid,
  p_profile_id uuid,
  p_period_from date,
  p_period_to   date,
  p_run_limit  int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
  v_run_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('search_run_limit:' || p_user_id::text));

  SELECT count(*) INTO v_count
    FROM public.search_runs
   WHERE user_id = p_user_id;

  IF p_run_limit >= 0 AND v_count >= p_run_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.search_runs (profile_id, user_id, status, period_from, period_to)
  VALUES (p_profile_id, p_user_id, 'pending', p_period_from, p_period_to)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_insert_search_run(uuid, uuid, date, date, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_and_insert_search_run(uuid, uuid, date, date, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_insert_search_run(uuid, uuid, date, date, int) TO service_role;
