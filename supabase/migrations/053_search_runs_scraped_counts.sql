ALTER TABLE search_runs
  ADD COLUMN IF NOT EXISTS total_scraped integer,
  ADD COLUMN IF NOT EXISTS pre_filter_count integer;
