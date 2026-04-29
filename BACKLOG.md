# Backlog

## Attachment-aware hashing (MHRA)

**Status:** Not started  
**Priority:** Low  
**Affects:** `lib/sync/canonical.ts` (`computeContentHash`), `lib/scrapers/mhra.ts`

### Problem

`computeContentHash` hashes only visible text fields (`title`, `manufacturer`, `fsn_date`, `raw_content`). MHRA's `enrichItem` strips HTML tags from the GOV.UK Content API body before storing it in `raw_content`, discarding attachment URLs in the process.

If a regulator updates a linked PDF (e.g., revised affected lot list) without changing the visible page text, `content_changed=false` and the AI filter cache is never invalidated. The stale decision remains in effect until `force_refresh`.

Swissmedic is partially covered: PDF URLs are included in `raw_content` (new attachments detected), but a PDF updated at an existing URL is still missed.

### Failure mode

User runs a search → records cached. Regulator updates attached PDF. User runs search again → cache serves old AI decision for MHRA records. User exports a stale report for PMS purposes.

### What's needed

In `lib/scrapers/mhra.ts` `enrichItem`: extract `details.attachments[].url` from the GOV.UK Content API response and append to `raw_content` so attachment URLs participate in the hash.

---

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

---

## Incremental sync — scheduled background job

**Status:** Not started  
**Priority:** Medium  
**Prerequisite:** Migration 021 deployed

### Problem

Currently, `sync_coverage` is only populated when a user triggers a search run. Sources are never proactively synced — a first search over a long range always does a full source fetch.

### What's needed

A background cron (daily or weekly) that:

1. For each source, determines the watermark (`MAX(covered_to)` from `sync_coverage`)
2. Fetches only the delta from watermark → today from each source
3. Upserts into `fsn_canonical` and updates `sync_coverage`
4. Does **not** run AI filter — that is user-scoped (per profile)

### Suggested approach

- New endpoint: `POST /api/admin/sync` (service role key required — never user-accessible)
- Or: Render/Supabase cron job invoking a standalone script
- Re-use `processSource` logic from `search-runs/route.ts` — extract into `lib/sync/ingest.ts`
- `force_refresh: false` always (coverage-aware)

### Constraints

- Must be idempotent — re-running for the same date range is safe (upsert + coverage merge)
- No user auth involved — background service only
- Keep separate from user-facing search-runs route

---

## Incremental sync — CLI for manual backfill

**Status:** Not started  
**Priority:** Low  
**Prerequisite:** Migration 021 deployed

### Problem

Bootstrapping historical coverage (e.g., importing 3 years of BfArM into `fsn_canonical`) requires a manual one-off ingestion that would time out in a user-facing request.

### What's needed

A CLI script (Node.js, run locally with service role key) that:

1. Accepts `--source`, `--from`, `--to` flags
2. Chunked ingestion (e.g., 90-day windows) to avoid memory pressure
3. Reports progress to stdout
4. Updates `sync_coverage` after each chunk

### Suggested approach

- `scripts/backfill.ts` — invoked via `npx ts-node scripts/backfill.ts --source bfarm --from 2022-01-01 --to 2024-12-31`
- Reuse `lib/sync/coverage.ts`, `lib/sync/canonical.ts`, and source scrapers directly
- Requires `SUPABASE_SERVICE_ROLE_KEY` in environment
