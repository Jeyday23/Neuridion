-- Add timing JSONB column to search_runs for per-stage instrumentation
ALTER TABLE search_runs ADD COLUMN IF NOT EXISTS timing jsonb DEFAULT NULL;

COMMENT ON COLUMN search_runs.timing IS 'Per-stage timing data in milliseconds for pipeline performance analysis';
