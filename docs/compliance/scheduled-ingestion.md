# Scheduled ingestion and mirror cutover

The repository contains scheduled-ingestion infrastructure. This document does
not establish that the worker, schedules, migrations, source allow-list or
evidence capture are active in any deployment. Verify the remote environment
before describing the worker as deployed, dark, shadow or operational.

## Sources

The current repository allow-list supports BfArM, MHRA and Swissmedic for this
worker path. MHRA uses the dual-channel adapter. FDA remains outside this
scheduled-ingestion path and EUDAMED remains reserved until an official,
machine-readable Vigilance interface and its evidence boundaries are verified.

## Safety properties

- QStash jobs carry a stable run UUID and are claimed through
  `claim_ingestion_run`. Completed deliveries are idempotent; failed or expired
  leases can be retried up to three times.
- Coverage advances only for `complete` or trustworthy `empty` outcomes through
  the existing advisory-lock `merge_coverage_for_source` RPC.
- Partial evidence is retained and observable but never certified as coverage.
- The worker stores exact adapter output. BfArM additionally stores exact HTML
  response bytes in private evidence storage; other sources do not yet claim raw
  HTTP or attachment retention.
- All production worker calls require QStash signatures. The worker-secret bypass
  is limited to non-production development/test environments.

## Activation

1. Verify the complete remote migration state and apply every release-required
   migration through the controlled workflow. Do not infer readiness from local
   migration files or apply only 068–069 if the release also depends on later
   migrations.
2. Confirm the `regulatory-evidence` bucket is private.
3. Set `SCHEDULED_INGESTION_SOURCES=swissmedic`.
4. Create one daily QStash schedule for
   `POST /api/worker/ingest/schedule`.
5. Record scheduler identity, deployed build, source/configuration and evidence
   capture state for every run.
6. Observe at least 14 clean scheduled runs before considering shadow mode.

## Shadow and mirror foundations

`INGEST_MODE_*` defaults to `live`. The resolver and comparison modules exist,
but are intentionally not connected to the user pipeline in this change. Before
connection, source-specific shadow exit thresholds must be established from real
data rather than copied from an unvalidated plan.

Shadow comparisons use `(source, source_record_id)` identity. Mirror mode also
requires complete `sync_coverage`; otherwise the resolver falls back to live.

FDA never enters mirror mode under this architecture.
