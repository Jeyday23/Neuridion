# Backlog

## Attachment-aware hashing (MHRA)

**Status:** Implemented in release schema 76 (`feat/mhra-document-monitoring`).

- `lib/scrapers/mhra.ts` lists attachments with GOV.UK metadata (`content_id`, `file_size`, `content_type`, `public_updated_at`). `raw_content` is unchanged, so existing text hashes stay stable.
- `lib/sources/document-monitor.ts` fetches every listed attachment from authority hosts only, revalidates with ETag / Last-Modified, hashes the body, and appends each new body to `source_document_versions` (append-only).
- `lib/sync/canonical.ts` tracks `attachment_digest` separately from the text hash. A PDF replaced at the same URL changes the digest, bumps `revision_count` and bypasses the AI decision cache.
- Degraded observations (detail page failed, one MHRA channel down) never overwrite a complete stored record and never count as a change.
- Covered date ranges re-verify their attachments on every run, so an old notice whose PDF changes is detected without re-entering the listing window.
- `lib/sources/input-currency.ts` compares what a run screened (`fsn_results.content_hash`, `attachment_digest`) with the current stored record and reports superseded inputs. Approved runs are never mutated.

Remaining limits:
- MHRA roundup pages are split into sections; attachments of a roundup page are not attributed to sections.
- Byte archiving to the private `regulatory-evidence` bucket is off by default (`SOURCE_DOCUMENT_ARCHIVE=true` to enable). Without it, history is sha256 + metadata, not the bytes.
- A body that reverts to an earlier version is not appended again (unique per record, URL and sha256); the canonical digest still reflects the revert.
- BfArM and Swissmedic attachments are not yet monitored.

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
