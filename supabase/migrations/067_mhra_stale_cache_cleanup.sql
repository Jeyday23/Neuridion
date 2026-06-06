-- 067_mhra_stale_cache_cleanup.sql
-- One-time cleanup: remove corrupted MHRA roundup titles from fsn_canonical
-- and invalidate MHRA sync_coverage so the next search re-scrapes fresh.
--
-- The MHRA roundup parser (commit dbc9005) now correctly extracts individual
-- FSNs from weekly roundup pages, but old canonical rows still have garbage
-- titles like "s: 3 to 7 November 2025" from the previous cleanTitle() bug.
-- Normal searches consult sync_coverage before scraping, so both tables must
-- be cleaned for the fix to take effect without force_refresh.
--
-- fsn_results.canonical_id has a FK to fsn_canonical.id, so we must null out
-- references before deleting canonical rows.

BEGIN;

-- Step 1: Null out FK references in fsn_results for corrupted canonical rows.
UPDATE public.fsn_results
SET canonical_id = NULL
WHERE canonical_id IN (
  SELECT id FROM public.fsn_canonical
  WHERE source = 'mhra'
    AND (title ~ '^s:\s*\d' OR title ~ '^s\s+for\s+\d')
);

-- Step 2: Delete corrupted MHRA canonical rows with broken roundup titles.
-- Pattern: title starts with "s: " or "s for " followed by a digit — the artifact
-- from cleanTitle() stripping "Field Safety Notice" and leaving "s: <date range>".
-- Covers variants: "s: 3 to 7 November 2025", "s for 05-09 January 2026".
DELETE FROM public.fsn_canonical
WHERE source = 'mhra'
  AND (title ~ '^s:\s*\d' OR title ~ '^s\s+for\s+\d');

-- Step 3: Delete all MHRA sync_coverage rows so the scraper re-fetches
-- every requested date range on the next search.
-- This is safe — it only forces MHRA to rebuild its cache. FDA, BfArM,
-- and Swissmedic coverage is untouched.
DELETE FROM public.sync_coverage
WHERE source = 'mhra';

COMMIT;
