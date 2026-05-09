-- Auto-purge login_attempts older than 90 days
-- Run via pg_cron or application-level scheduled job
CREATE OR REPLACE FUNCTION public.purge_old_login_attempts()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.login_attempts
  WHERE attempted_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
