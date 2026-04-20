-- Add 'filter_failed' as a valid decision state for items the AI could not analyze.
-- This lets us distinguish "AI said uncertain" from "AI was never asked".

-- Update CHECK constraint on filter_decisions.decision
ALTER TABLE public.filter_decisions
  DROP CONSTRAINT IF EXISTS filter_decisions_decision_check;
ALTER TABLE public.filter_decisions
  ADD CONSTRAINT filter_decisions_decision_check
  CHECK (decision IN ('relevant', 'uncertain', 'excluded', 'filter_failed'));

-- Track filter failures separately so they don't inflate uncertain_count
ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS filter_failed_count integer NOT NULL DEFAULT 0;
