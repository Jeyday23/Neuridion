-- Replace the DO INSTEAD NOTHING delete rule on filter_decisions with a
-- BEFORE DELETE trigger that raises an explicit error. This prevents
-- CASCADE deletes from silently leaving orphaned rows — they now fail
-- loudly, forcing all deletions to go through gdpr_purge_user_data()
-- which disables the protection first.

DROP RULE IF EXISTS no_delete_filter_decisions ON public.filter_decisions;

CREATE OR REPLACE FUNCTION public.prevent_filter_decisions_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'filter_decisions is append-only — use gdpr_purge_user_data() for deletions'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_prevent_filter_decisions_delete
  BEFORE DELETE ON public.filter_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_filter_decisions_delete();
