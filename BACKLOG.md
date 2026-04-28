# Backlog

## FDA MAUDE — bulk-download ingestion for full historical coverage

**Status:** Not started  
**Priority:** Medium  
**Related commits:** `af32a98`, `d2a0e65`

### Problem

The live openFDA API (`/device/event.json`) caps accessible records at **26,000 per query**
(skip + limit ≤ 26,000). For date windows with more MDR reports than this — common for
ranges > ~3 months — the scraper hits the cap and marks the run as `degraded` with a
descriptive warning in `error_message`.

### What's needed

A separate ingestion pipeline using the openFDA **bulk download** JSON files:

- Download manifest: <https://open.fda.gov/apis/device/event/download/>
- Files are partitioned by year/quarter and updated weekly
- Each file is a gzipped JSON array of full MDR event records

### Suggested approach

1. Fetch the download manifest JSON to get current file URLs and checksums
2. Download only the quarter files that overlap with the requested date range
3. Stream-parse gzipped JSON (avoid loading full files into memory — files can be 100s of MB)
4. Apply the same `mapMaudeRecord()` field mapping from `lib/scrapers/fda-maude.ts`
5. Deduplicate against already-ingested records via `external_id`
6. Store via the same `fsn_results` + `filter_decisions` pipeline

### Constraints

- Separate code path from `scrapeFdaMaude()` — do **not** change the live scraper's signature
- Belongs in a background job / cron, not a user-triggered request
- `OPENFDA_API_KEY` is not required for bulk downloads (public S3 URLs)
- The live API path remains for recent/incremental syncs (last 30–90 days)
