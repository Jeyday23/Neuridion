-- Replace the silent DO INSTEAD NOTHING update rule with a BEFORE UPDATE
-- trigger that raises an explicit error. Silent rules hide bugs — an
-- accidental UPDATE should fail loudly, not silently succeed with no effect.

DROP RULE IF EXISTS no_update_filter_decisions ON public.filter_decisions;

CREATE OR REPLACE FUNCTION public.prevent_filter_decisions_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'filter_decisions is append-only — updates are not permitted'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_prevent_filter_decisions_update
  BEFORE UPDATE ON public.filter_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_filter_decisions_update();
