-- 030_fix_filter_decisions_schema.sql
-- Production filter_decisions was manually patched to rename 'model' → 'model_used'.
-- This migration makes fresh deployments match production by ensuring 'model_used'
-- exists (renaming from 'model' if the original name is still present) and adds
-- the 'stage' column used by the two-stage pipeline.

DO $$
BEGIN
  -- Rename legacy 'model' column to 'model_used' if it hasn't been renamed yet
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'model'
  ) THEN
    ALTER TABLE public.filter_decisions RENAME COLUMN model TO model_used;
  END IF;

  -- Add 'model_used' if somehow it is missing entirely
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'model_used'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN model_used text NOT NULL DEFAULT '';
  END IF;

  -- Add 'stage' column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'stage'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN stage text NOT NULL DEFAULT 'stage1';
  END IF;
END $$;
