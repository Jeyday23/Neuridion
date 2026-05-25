-- Drop legacy search_run_id column from fsn_results.
-- Production has both run_id (active, CASCADE) and search_run_id (legacy, nullable, NO ACTION).
-- All app code uses run_id; search_run_id is dead weight that forced a NULL-out workaround
-- in the profile delete route.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fsn_results' AND column_name = 'search_run_id'
  ) THEN
    ALTER TABLE public.fsn_results DROP COLUMN search_run_id;
  END IF;
END $$;
