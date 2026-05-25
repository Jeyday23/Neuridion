-- Rollback 056: Remove update trigger, restore the silent DO INSTEAD NOTHING rule.
DROP TRIGGER IF EXISTS trg_prevent_filter_decisions_update ON public.filter_decisions;
DROP FUNCTION IF EXISTS public.prevent_filter_decisions_update();

CREATE RULE no_update_filter_decisions AS
  ON UPDATE TO public.filter_decisions
  DO INSTEAD NOTHING;
