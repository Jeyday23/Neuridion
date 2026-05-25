-- Rollback 060: Drop the GDPR purge function entirely.
-- The previous version (from 048) will need to be re-applied separately if needed.
DROP FUNCTION IF EXISTS public.gdpr_purge_user_data(uuid);
