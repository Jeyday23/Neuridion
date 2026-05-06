-- 030_fix_filter_decisions_schema.sql
-- The filter_decisions table was created with a 'model' column (migration 003).
-- Pipeline code was previously written to use 'model_used' and 'stage' which
-- do not exist in the production schema. Those column references have been
-- corrected in application code to use 'model'.
--
-- This migration only adds the 'stage' column if it is ever needed for
-- two-stage pipeline tracking. It is safe to apply at any time.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'stage'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN stage text NOT NULL DEFAULT 'stage1';
  END IF;
END $$;
