-- 030_fix_filter_decisions_schema.sql
-- filter_decisions was created with a 'model' column (migration 003) but
-- application code uses 'model_used'. The pipeline also inserts a 'stage'
-- column that never existed in the original schema.
-- IF EXISTS guards make this safe on both production (already patched) and
-- fresh deployments (applies the rename/add for the first time).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'model'
  ) THEN
    ALTER TABLE public.filter_decisions RENAME COLUMN model TO model_used;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'model_used'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN model_used text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'filter_decisions'
      AND column_name  = 'stage'
  ) THEN
    ALTER TABLE public.filter_decisions ADD COLUMN stage text NOT NULL DEFAULT 'stage1';
  END IF;
END $$;
