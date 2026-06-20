# Scheduled ingestion and mirror cutover

The scheduled worker is deployed dark. It does not change user search behavior.

## Sources

Only BfArM, MHRA, and Swissmedic are eligible. MHRA uses the production
dual-channel adapter. FDA remains live-query signal evidence and EUDAMED remains
reserved until an official machine-readable Vigilance interface is verified.

## Safety properties

- QStash jobs carry a stable run UUID and are claimed through
  `claim_ingestion_run`. Completed deliveries are idempotent; failed or expired
  leases can be retried up to three times.
- Coverage advances only for `complete` or trustworthy `empty` outcomes through
  the existing advisory-lock `merge_coverage_for_source` RPC.
- Partial evidence is retained and observable but never certified as coverage.
- The worker stores exact adapter output. It does not claim raw HTTP or attachment
  retention.
- All production worker calls require QStash signatures. The worker-secret bypass
  is limited to non-production development/test environments.

## Activation

1. Apply migrations 068 and 069 and run `verify:release`.
2. Confirm the `regulatory-evidence` bucket is private.
3. Set `SCHEDULED_INGESTION_SOURCES=swissmedic`.
4. Create one daily QStash schedule for
   `POST /api/worker/ingest/schedule`.
5. Observe at least 14 clean scheduled runs before considering shadow mode.

## Shadow and mirror foundations

`INGEST_MODE_*` defaults to `live`. The resolver and comparison modules exist,
but are intentionally not connected to the user pipeline in this change. Before
connection, source-specific shadow exit thresholds must be established from real
data rather than copied from an unvalidated plan.

Shadow comparisons use `(source, source_record_id)` identity. Mirror mode also
requires complete `sync_coverage`; otherwise the resolver falls back to live.

FDA never enters mirror mode under this architecture.

