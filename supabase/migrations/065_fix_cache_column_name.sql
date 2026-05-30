-- Rename filter_decision_cache.rationale to match application code
-- The code queries 'reasoning' but the DB column was created as 'rationale'.
ALTER TABLE filter_decision_cache RENAME COLUMN rationale TO reasoning;
