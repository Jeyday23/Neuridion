# Neuridion Enterprise Scale Roadmap

**Status:** Proposed — implementation requires explicit approval  
**Date:** 2026-06-24  
**Planning branch:** `plan/enterprise-scale-roadmap`  
**Baseline commit:** `24dc223`  
**Scope:** Architecture, frontend, API, database, security, operations, and delivery quality  
**Behavior rule:** Preserve product behavior and regulatory meaning unless a separately approved product change says otherwise

## 1. Executive decision

Neuridion has a credible production-oriented foundation, but it is not currently
designed for millions of active users or high concurrent search volume.

The correct next step is not a full rewrite and not Kubernetes. The correct path
is a staged modular-monolith evolution:

1. Establish measurable service-level and accuracy baselines.
2. Fix job ownership and split status reads from result reads.
3. Isolate search and report workloads from the public web service.
4. Make scheduled canonical ingestion the primary search data path.
5. Normalize per-run storage and paginate every unbounded read.
6. Introduce organization tenancy only after job and data boundaries are stable.
7. Consider Kubernetes only if Render becomes a measured constraint.

Each phase must be independently deployable, reversible, and behavior-preserving.
No phase may depend on an unreviewed “big bang” migration.

## 2. What this plan corrects from earlier proposals

Earlier architecture, frontend, security, and DevOps proposals identified valid
problems but contained weaknesses when considered as one program.

### 2.1 “Millions of users” was not defined

Registered users, monthly active users, concurrent sessions, and concurrent
regulatory searches create radically different workloads.

This plan therefore uses explicit initial design targets:

| Measure | Initial target |
|---|---:|
| Registered users | 1,000,000 |
| Monthly active users | 100,000 |
| Peak concurrent web sessions | 10,000 |
| Peak search submissions | 50/minute |
| Concurrent search jobs | 100 |
| Search status request p95 | < 300 ms |
| General authenticated API p95 | < 500 ms |
| Search enqueue p95 | < 750 ms |
| Web availability | 99.9% initially |
| Completed search result durability | 99.99% |
| Duplicate job execution | 0 tolerated |
| Authority-record identity loss | 0 for certified source windows |

These are planning assumptions, not claims about current capacity. They must be
confirmed through load tests and cost modelling before production capacity is
advertised.

### 2.2 Two competing worker architectures existed

The repository contains:

- a Postgres queue with `claim_next_job()` and `SKIP LOCKED`;
- a QStash HTTP callback that performs the entire pipeline inside the web app.

Running both as independent ownership systems creates ambiguous retry and lease
semantics. The target decision is:

- **Postgres is the source of truth for job state and ownership.**
- **A dedicated Render background worker atomically claims jobs from Postgres.**
- QStash may wake or schedule work, but it must not own search execution state.
- During migration, the current QStash endpoint remains as a compatibility
  dispatcher and never executes a claimed job itself.

This makes duplicate prevention, leases, retries, cancellation, and recovery
testable in one place.

### 2.3 Realtime and polling were proposed without a clear contract

Realtime is useful but cannot be the only correctness path. Connections drop,
browser tabs sleep, and clients reconnect.

The target contract is:

- a lightweight status endpoint is authoritative;
- optional Supabase Realtime events reduce perceived latency;
- clients reconcile against the status endpoint after reconnect;
- terminal results are retrieved from a separate cursor-paginated endpoint.

### 2.4 The previous plan mixed urgent and multi-quarter work

Atomic job claiming and status payload separation are urgent. Organization
tenancy, read replicas, table partitioning, and regional deployments are not the
same release.

This plan orders work by dependency and risk. Later phases cannot begin merely
because they sound “enterprise.”

### 2.5 The frontend proposal lacked a safe migration method

Replacing all UI components at once would create accessibility and behavioral
regressions. The target is an incremental compatibility layer:

- introduce primitives matching current visual output;
- migrate one feature surface at a time;
- add visual, keyboard, and axe tests before replacing the next surface;
- do not combine visual redesign with architecture migration.

### 2.6 The data-normalization proposal omitted migration volume and rollback

Replacing copied `fsn_results` rows with references to immutable authority
revisions requires dual writing, backfill verification, and read parity.

The target uses expand-and-contract:

1. Add the new association table.
2. Dual-write.
3. Backfill in bounded batches.
4. Shadow-read and compare.
5. Switch reads behind a feature flag.
6. Retain legacy rows through the regulatory retention decision.
7. Remove legacy writes only after a separately approved migration.

### 2.7 Accuracy could be lost during scalability work

The product’s value depends on regulator identity and field accuracy. Faster
execution is not a successful refactor if it changes retained records.

Every phase that touches search must pass:

- exact authority-ID comparisons;
- required-field parity;
- date-window parity;
- duplicate checks;
- reviewed PRRC fixtures;
- source completeness/outcome checks;
- current accuracy regression profiles, including product-name variants.

### 2.8 Observability was proposed after architecture changes

Without baseline traces and metrics, the team cannot prove an improvement or
find regressions. Observability therefore begins in Phase 0, before workload
movement.

## 3. Non-negotiable engineering principles

1. **No big-bang rewrite.**
2. **One owner for every state transition.**
3. **Authority evidence is immutable and identity-based.**
4. **Every unbounded collection is paginated, streamed, or batch processed.**
5. **Web requests never own long-running regulatory work.**
6. **Retries are explicit, bounded, and idempotent.**
7. **Production schema compatibility is checked before deploy.**
8. **Security and audit controls are tested, not documented only.**
9. **A feature flag needs an owner, expiry date, and rollback procedure.**
10. **Performance changes must publish before/after measurements.**
11. **No visual redesign inside an infrastructure or data migration.**
12. **`main` remains deployable after every merged phase.**

## 4. Current architecture and primary constraints

### 4.1 Current execution flow

```text
Browser
  -> Next.js web/API service
      -> create search_run and search_job_queue rows
      -> publish QStash HTTP message
  -> QStash calls public worker route
      -> same Next.js/Render service performs:
           source scraping
           canonical storage
           per-run result insertion
           deterministic filtering
           AI filtering
           finalization
  -> Browser polls one endpoint every three seconds
      -> endpoint reloads complete result and decision sets
  -> Report generation runs in a public API request
```

### 4.2 Current strong foundations

- strict TypeScript;
- broad unit/integration coverage;
- RLS and service-role boundaries;
- append-only audit and evidence structures;
- canonical regulator records and revision history;
- coverage tracking;
- rate limiting;
- QStash signature verification;
- CI and controlled production migration workflow;
- immutable profile snapshots and PRRC review gates.

### 4.3 Current critical constraints

| Area | Constraint | Severity |
|---|---|---|
| Search jobs | Read-then-update idempotency guard is race-prone | Critical |
| Compute | Web, scraping, filtering, and reports share one service | Critical |
| Read path | Polling reloads complete results and decisions | Critical |
| Source access | Users can cause repeated live regulator scraping | High |
| Storage | Authority content is copied into every run | High |
| Memory | Search and report stages materialize full collections | High |
| Schema | Runtime compatibility fallbacks can hide migration drift | High |
| UI | Complete datasets rendered client-side | High |
| Operations | No durable structured tracing/metrics baseline | High |
| Frontend | Fragmented primitives and inconsistent accessibility | Medium |
| Delivery | Render uses `npm install`, not deterministic `npm ci` | Medium |
| Dependencies | Current low/moderate advisories need deliberate upgrades | Medium |

## 5. Target architecture

### 5.1 Service topology

```text
                         +-----------------------+
Browser / API client --->| CDN / Next.js Web API |
                         +-----------+-----------+
                                     |
                    commands         |          queries
                                     |
                    +----------------v--+    +--v----------------+
                    | Search command API |    | Query API          |
                    +---------+----------+    | paginated/read-only|
                              |               +---------+----------+
                              |                         |
                       +------v------+          +-------v--------+
                       | Postgres job |          | Postgres /      |
                       | queue/state  |          | read replica*   |
                       +------+-------+          +----------------+
                              |
                 +------------+-------------+
                 |                          |
          +------v-------+           +------v--------+
          | Search worker |           | Report worker |
          +------+-------+           +------+--------+
                 |                          |
          +------v--------------------------v--+
          | Canonical authority/evidence store |
          +----------------+-------------------+
                           |
                    +------v-------+
                    | Object storage|
                    +--------------+

Scheduled ingestion workers
  -> regulator adapters
  -> raw evidence
  -> canonical records/revisions
  -> searchable normalized projection

* Read replica is a later measured optimization, not a Phase 0 dependency.
```

### 5.2 Deployment decision

Use Render multi-service architecture before Kubernetes:

- `neuridion-web`
- `neuridion-search-worker`
- `neuridion-report-worker`
- `neuridion-ingestion-worker` or scheduled ingestion jobs
- Supabase Postgres/Auth/Storage
- Upstash Redis for rate limiting and optional event coordination
- external log, metric, trace, and error-monitoring provider

Kubernetes is reconsidered only when one of these is measured:

- Render service limits block required concurrency;
- regional active-active deployment is required;
- compliance requires cluster/network controls unavailable on Render;
- workload scheduling cost is materially lower on Kubernetes after staffing cost;
- the team has dedicated platform engineering ownership.

## 6. Target module architecture

The repository should evolve incrementally toward:

```text
src/
  modules/
    searches/
      domain/
      application/
      infrastructure/
      presentation/
    regulatory/
      domain/
      application/
      infrastructure/adapters/
    classification/
    reporting/
    profiles/
    identity/
    audit/
  platform/
    database/
    queue/
    cache/
    observability/
    security/
    configuration/
  workers/
    search/
    ingestion/
    reports/
  shared/
    errors/
    validation/
    types/
```

This is a direction, not permission for a mass file move. New modules adopt the
boundaries first. Existing code moves only when touched by an approved phase.

Dependency rule:

```text
presentation -> application -> domain
infrastructure implements application/domain ports
domain imports no Next.js, Supabase, QStash, Render, or Anthropic code
```

## 7. API contract

### 7.1 Versioned endpoints

```text
POST /api/v1/search-runs
GET  /api/v1/search-runs/{id}/status
GET  /api/v1/search-runs/{id}/summary
GET  /api/v1/search-runs/{id}/results
GET  /api/v1/search-results/{id}
POST /api/v1/search-runs/{id}/cancel
POST /api/v1/search-runs/{id}/reports
GET  /api/v1/report-jobs/{id}
```

### 7.2 Result pagination

Use cursor pagination, not offset pagination:

```text
GET /api/v1/search-runs/{id}/results
  ?decision=relevant
  &source=fda
  &limit=50
  &cursor=<signed cursor>
```

Cursor ordering:

```text
(fsn_date DESC NULLS LAST, id DESC)
```

### 7.3 Response envelope

```ts
type ApiSuccess<T> = {
  data: T
  meta: {
    requestId: string
    nextCursor?: string
  }
}

type ApiFailure = {
  error: {
    code: string
    message: string
    retryable: boolean
  }
  requestId: string
}
```

### 7.4 Status response

The status endpoint must not join or return results:

```ts
type SearchRunStatus = {
  id: string
  status: 'pending' | 'running' | 'complete' | 'degraded' | 'error' | 'cancelled'
  version: number
  progress: {
    currentStage: string | null
    completedSources: string[]
    totalSources: string[]
    itemsFound: number
  } | null
  updatedAt: string
}
```

## 8. Job ownership and recovery

### 8.1 Required job columns

```text
status
worker_id
locked_at
lease_expires_at
heartbeat_at
attempt_count
max_attempts
next_attempt_at
last_error_code
last_error_message
pipeline_version
```

### 8.2 Atomic claim

Workers claim through one RPC using row locking. No worker may use a separate
read-then-update status check.

### 8.3 Heartbeat and graceful shutdown

- renew the lease at a bounded interval;
- stop claiming new jobs after `SIGTERM`;
- checkpoint after each source and major stage;
- release or expire the lease if shutdown occurs;
- never assume an in-memory finally block will execute.

### 8.4 Failure taxonomy

```text
retryable:
  upstream timeout
  upstream 429/5xx
  temporary database/network failure
  worker shutdown

non-retryable:
  invalid profile
  invalid source configuration
  unsupported schema version
  deterministic validation failure

degraded:
  one source partial
  AI unavailable with deterministic results preserved
```

Returning HTTP 200 after every logical worker failure is not sufficient. The
database job state controls retries; transport acknowledgements only confirm
message receipt.

## 9. Data architecture

### 9.1 Preserve identity boundary

```text
fsn_canonical / authority_record_revisions
  = regulator authority records

regulatory_safety_actions
  = cross-authority real-world corrective actions

search_run_results
  = run-specific association and matching evidence
```

These identities must not be collapsed.

### 9.2 Proposed association table

```sql
CREATE TABLE public.search_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.search_runs(id),
  authority_revision_id uuid NOT NULL
    REFERENCES public.authority_record_revisions(id),
  match_algorithm_version text NOT NULL,
  match_score numeric,
  matched_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, authority_revision_id)
);
```

### 9.3 Migration safety

- dual-write old and new result models;
- batch backfill by primary key;
- record batch checkpoints;
- compare identity sets and fields;
- run shadow reads;
- switch reads with a kill switch;
- do not delete retained legacy data during initial migration.

### 9.4 Required indexes

Validate with real `EXPLAIN (ANALYZE, BUFFERS)` before applying:

```sql
CREATE INDEX search_runs_user_created_active_idx
  ON search_runs (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX search_runs_user_status_active_idx
  ON search_runs (user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX search_run_results_run_date_idx
  ON search_run_results (run_id, created_at DESC, id DESC);

CREATE INDEX filter_decisions_run_result_created_idx
  ON filter_decisions (search_run_id, fsn_result_id, created_at DESC);

CREATE INDEX canonical_source_date_id_idx
  ON fsn_canonical (source, fsn_date DESC, id);
```

### 9.5 Partitioning trigger

Do not partition merely because a table is append-only. Partition when measured
table size, vacuum pressure, index size, retention jobs, or query plans justify
it. Candidate tables:

- `audit_log`
- `source_fetches`
- `fsn_observations`
- `authority_record_revisions`
- `filter_decisions`
- `search_runs`

## 10. Ingestion-first search

Interactive user searches should query canonical indexed storage.

### 10.1 Cutover sequence

1. Complete scheduled ingestion coverage per source.
2. Record freshness and coverage SLAs.
3. Shadow-compare live adapters with canonical queries.
4. Require identity agreement thresholds.
5. Enable canonical reads for one source at a time.
6. Keep live retrieval as an operational fallback behind a feature flag.
7. Remove user-triggered live scraping only after sustained parity.

### 10.2 Source-specific caution

- FDA may require a separate ingestion/bulk strategy due to volume.
- BfArM archive behavior must retain bounded pagination and exact notice fields.
- MHRA Excel and GOV.UK remain independent evidence channels.
- Swissmedic identity comparison must remain exact.

## 11. Classification architecture

AI classification is enrichment, not authority retrieval.

Classification identity:

```text
authority_revision_id
+ profile_fingerprint
+ deterministic_match_version
+ prompt_version
+ classifier_version
+ model_version
```

The classification worker:

- reads pending classification tasks;
- checks immutable cache identity;
- enforces distributed rate/cost limits;
- writes append-only decisions;
- supports manual-review fallback;
- records tokens, latency, model, prompt version, and terminal error class.

No search job should fail solely because paid AI is unavailable. It should
complete as degraded with deterministic results marked for manual review.

## 12. Frontend architecture

### 12.1 Design-system migration

Add primitives that reproduce current styles:

```text
components/primitives/
  Button
  IconButton
  Input
  Select
  Checkbox
  Dialog
  Tooltip
  Spinner
  Skeleton

components/feedback/
  Alert
  EmptyState
  ErrorState
  AsyncState
  Toast
  Progress

components/data-display/
  Badge
  DataTable
  Pagination
  VirtualList
```

Required component properties:

- explicit semantic element;
- keyboard behavior;
- focus-visible behavior;
- disabled and loading states;
- accessible name requirements;
- responsive behavior;
- reduced-motion handling;
- test IDs only where semantic queries are insufficient.

### 12.2 Search feature decomposition

```text
features/searches/
  components/
    SearchForm
    SourceSelector
    SearchProgress
    SearchSummary
    SearchResults
    SearchResultRow
  hooks/
    useSearchRunStatus
    useSearchResults
  state/
    searchMachine
  api/
    searchClient
```

### 12.3 State model

Replace loosely coordinated booleans with explicit states:

```text
idle
submitting
queued
running
reconnecting
complete
degraded
cancelled
error
```

### 12.4 Accessibility gates

- WCAG 2.2 AA target;
- explicit `type` on every button;
- `aria-live` for status changes;
- `aria-expanded` and `aria-controls` for result rows;
- keyboard-operable menus and dialogs;
- focus moves to validation errors and terminal search summaries;
- reduced-motion support;
- color contrast tests;
- Playwright + axe automated checks;
- manual keyboard and screen-reader release checklist.

### 12.5 Rendering scalability

- retrieve results only after terminal status;
- cursor-page result lists;
- fetch raw content only on expansion;
- virtualize only when page size and interaction justify it;
- perform filtering and source selection on the server;
- keep URL query parameters as the shareable list state;
- avoid sending excluded raw content to the client unless requested.

## 13. Security architecture

### 13.1 Immediate controls

- atomic job claims;
- per-user and per-tenant job concurrency quotas;
- queue depth and cost budgets;
- deterministic dependency installation with `npm ci`;
- zero-warning lint policy in changed files, then repository-wide;
- deliberate dependency upgrades, never blind `npm audit fix --force`;
- production schema-version gate;
- durable audit outbox for regulatory release actions;
- structured redaction library for logs and errors.

### 13.2 Audit reliability classes

```text
best effort:
  ordinary navigation telemetry

durable asynchronous:
  normal profile/search operations

fail closed:
  PRRC approval
  report release
  privilege change
  data deletion/anonymization
  evidence governance action
```

### 13.3 Tenant model

Do not add organization tenancy by placing `organization_id` on a few tables.
It requires:

- organizations;
- memberships;
- roles and permissions;
- tenant-scoped unique constraints;
- tenant-aware RLS;
- tenant-aware audit records;
- tenant-specific retention and export;
- invitation lifecycle;
- ownership transfer;
- service-account policy.

This is a dedicated later phase with migration and authorization testing.

## 14. Observability and SRE

### 14.1 Structured event shape

```json
{
  "timestamp": "ISO-8601",
  "level": "info",
  "service": "search-worker",
  "environment": "production",
  "request_id": "uuid",
  "run_id": "uuid",
  "job_id": "uuid",
  "event": "source_fetch_completed",
  "source": "fda",
  "outcome": "complete",
  "duration_ms": 1234,
  "records": 833,
  "warning_codes": []
}
```

Never log raw API keys, access tokens, emails, full IP addresses, regulator
payloads containing personal data, or unrestricted upstream URLs.

### 14.2 Required metrics

- HTTP rate, latency, errors, saturation;
- queue depth and oldest-job age;
- job attempts and duplicate-claim rejection;
- stage and source duration;
- source completeness outcome;
- authority and retained record counts;
- database latency and pool use;
- worker memory and event-loop delay;
- AI latency, token use, cost, and failure class;
- report duration, size, and failure stage;
- accuracy benchmark identity agreement.

### 14.3 Initial SLOs

```text
Web availability:                    99.9%
Search enqueue availability:         99.9%
Search status endpoint p95:          <300 ms
No duplicate successful job owners:  100%
Certified source identity agreement: 100% for reviewed windows
Audit write for release actions:      100%
```

### 14.4 Alert examples

- oldest search job > 5 minutes;
- queue depth exceeds worker capacity threshold;
- source partial/failed rate exceeds baseline;
- database pool > 75%;
- worker memory > 80%;
- audit outbox delivery delayed;
- result identity benchmark regression;
- report generation p95 exceeds target;
- repeated worker lease expiration.

## 15. CI/CD and deployment

### 15.1 Pull-request gates

1. `npm ci`
2. TypeScript
3. ESLint
4. unit/integration tests
5. component tests
6. Playwright accessibility tests
7. production build
8. dependency audit
9. secret scan
10. CodeQL or Semgrep
11. container build
12. image vulnerability scan
13. SBOM generation
14. migration lint and schema compatibility
15. preview smoke tests
16. accuracy regression when search code changes

### 15.2 Production flow

1. Build one immutable artifact.
2. Sign it and retain the SBOM.
3. Deploy staging.
4. Run expand-only migrations.
5. Run authenticated smoke tests and synthetic searches.
6. Require production approval.
7. Deploy workers before web only when backward compatible.
8. Deploy web.
9. Verify health, queue ownership, accuracy canaries, and SLOs.
10. Roll back automatically or manually according to the phase runbook.

### 15.3 Render topology

The future Blueprint should define separate services. It must not be introduced
until worker entrypoints, health checks, shutdown behavior, and queue ownership
tests exist.

### 15.4 Multi-instance Next.js caution

Before web autoscaling:

- define deployment ID and encryption-key consistency;
- coordinate Next.js cache invalidation across instances if caching is used;
- verify sticky state does not exist in process memory;
- verify Redis-backed rate limiting is mandatory;
- load-test Supabase/Supavisor connection behavior.

## 16. Phased implementation plan

## Phase 0 — Baselines and safety rails

**Goal:** Measure current behavior and make later changes provable.

Deliverables:

- architecture decision records;
- structured logger with redaction;
- request/run/job correlation IDs;
- baseline dashboards;
- k6 or equivalent API load harness;
- Playwright + axe baseline;
- bundle-size report;
- accuracy identity regression command;
- production schema-version check;
- explicit feature-flag registry and expiry policy.

Exit gates:

- baseline p50/p95/p99 documented;
- current queue/job failure modes reproduced;
- no secrets in logs;
- accuracy suite produces non-vacuous identity evidence.

Rollback: remove instrumentation hooks; no data-path change.

## Phase 1 — Atomic jobs and scalable result reads

**Goal:** Remove duplicate execution and polling amplification.

Deliverables:

- atomic job claim RPC;
- lease, heartbeat, attempt, and error classification;
- status-only endpoint;
- cursor-paginated results endpoint;
- detail endpoint for raw content;
- UI status reconciliation;
- optional Realtime acceleration with polling fallback;
- old endpoint compatibility adapter.

Exit gates:

- concurrent delivery test proves one owner;
- 10,000 simulated status clients remain within target;
- result identity parity with old endpoint;
- cancellation and retry tests pass;
- no full results returned from status calls.

Rollback: route clients to compatibility endpoint; new tables/columns remain.

## Phase 2 — Dedicated search and report workers

**Goal:** Isolate long-running workloads from public traffic.

Deliverables:

- search worker entrypoint;
- report worker entrypoint;
- graceful shutdown;
- worker health and readiness;
- bounded concurrency configuration;
- queue-age and worker-saturation metrics;
- Render Blueprint additions;
- QStash compatibility dispatcher.

Exit gates:

- web remains responsive under maximum worker load;
- deployment during an active job recovers without duplication;
- report generation cannot exhaust the web service;
- worker rollback tested.

Rollback: stop background services and reactivate compatibility execution path
only if the atomic ownership contract remains intact.

## Phase 3 — Ingestion-first source architecture

**Goal:** Prevent user traffic from repeatedly scraping regulators.

Deliverables:

- scheduled ingestion coverage for each approved source;
- freshness SLA model;
- canonical query service;
- source-by-source shadow comparison;
- operational live-source fallback;
- FDA volume strategy.

Exit gates:

- sustained identity agreement threshold met;
- source freshness dashboards active;
- interactive searches do not contact migrated sources normally;
- outage simulation serves last certified coverage with explicit status.

Rollback: source-specific feature flag returns that source to live retrieval.

## Phase 4 — Frontend system and large-result UX

**Goal:** Standardize accessibility and support large result sets.

Deliverables:

- compatibility design primitives;
- migrated search and archive surfaces;
- explicit state machine;
- keyboard and screen-reader behavior;
- paginated/virtualized lists;
- lazy details;
- responsive dashboard layouts;
- zero implicit-submit buttons.

Exit gates:

- no critical axe findings;
- keyboard checklist passes;
- visual regression approved;
- large-result browser memory and interaction targets met;
- no product behavior or terminology change.

Rollback: component-by-component, not whole-app.

## Phase 5 — Normalized run-result storage

**Goal:** Stop duplicating authority content for every run.

Deliverables:

- `search_run_results`;
- dual write;
- bounded backfill;
- parity reports;
- shadow read;
- feature-flag cutover;
- storage growth forecast.

Exit gates:

- exact identity and field parity;
- backfill restartability;
- read performance target met;
- retention/legal review completed.

Rollback: switch reads to legacy table; preserve dual writes until resolved.

## Phase 6 — Enterprise tenancy and access control

**Goal:** Add real organization boundaries.

Prerequisites:

- stable job ownership;
- normalized data boundaries;
- versioned APIs;
- durable audit delivery;
- authorization test framework.

Deliverables:

- organization and membership model;
- permission matrix;
- tenant RLS;
- invitations;
- tenant exports and retention;
- SSO/SAML and SCIM plan;
- service accounts if required.

Exit gates:

- cross-tenant isolation tests;
- administrative audit evidence;
- account recovery and ownership-transfer runbooks;
- penetration test.

## Phase 7 — Measured infrastructure expansion

Possible deliverables only if metrics justify them:

- Supabase compute upgrade;
- read replicas;
- table partitioning;
- regional services;
- dedicated search index;
- Kubernetes evaluation.

No item in this phase is automatic.

## 17. Branch and merge strategy

This planning branch contains documentation only.

Implementation must use separate branches:

```text
feat/phase-0-observability-baseline
feat/phase-1-atomic-jobs
feat/phase-1-paginated-results
feat/phase-2-search-worker
feat/phase-2-report-worker
refactor/phase-4-ui-primitives
```

Rules:

- never implement all phases on one branch;
- rebase each implementation branch on the latest verified `main`;
- preserve and merge current accuracy fixes before changing search matching;
- one database expand migration per independently deployable capability;
- no destructive migration in the same release as its read cutover;
- each PR includes rollback instructions and measured evidence;
- production deploy remains a separate approval from code merge.

## 18. Specific dependency on current uncommitted work

At the time this plan was written, the main checkout contained uncommitted
accuracy work affecting regulator retrieval and filtering. This planning branch
was deliberately created from `origin/main` so it would not absorb or alter
those changes.

Before any implementation phase touching search behavior:

1. complete and verify the accuracy work;
2. commit it on its own feature branch;
3. merge it through the normal review path;
4. rebase the implementation branch on that merged baseline;
5. rerun exact authority identity tests.

The architecture program must not overwrite or silently reimplement those fixes.

## 19. Program risks

| Risk | Mitigation |
|---|---|
| Scope expands into a rewrite | Phase boundaries and no mass file moves |
| Performance work changes accuracy | Exact-ID and field parity gates |
| Dual queues cause duplicate jobs | Postgres as sole ownership authority |
| Realtime becomes correctness dependency | Authoritative status endpoint |
| Data migration becomes irreversible | Dual write, shadow read, kill switch |
| UI refactor changes product behavior | Compatibility styling and visual tests |
| Worker split increases secret exposure | Per-service least-privilege env groups |
| More services increase operational burden | Add only after Phase 0 observability |
| Autoscaling overloads database | Pool metrics and controlled max instances |
| Dependency “fix” causes downgrade | Deliberate top-level upgrades and full gates |
| Enterprise tenancy leaks data | Dedicated RLS and cross-tenant test phase |
| Regulatory evidence is weakened | Immutable revision references and retention review |

## 20. Approval checkpoints

Approval is required separately for:

1. Phase 0 implementation.
2. Database changes for atomic job claims.
3. API response changes.
4. Render service topology changes.
5. Canonical-search cutover per source.
6. UI primitive migration.
7. Result-storage normalization.
8. Organization tenancy.
9. Any destructive migration.
10. Kubernetes or provider migration.

## 21. Recommended first approval

Approve only:

### Package A — Phase 0

- structured telemetry;
- baselines;
- load and accessibility harnesses;
- schema/version gates;
- accuracy regression integration.

### Package B — first half of Phase 1

- atomic job claim;
- lease/heartbeat model;
- status-only endpoint;
- cursor-paginated results endpoint;
- compatibility adapter;
- concurrency and parity tests.

Do not approve worker deployment, broad UI refactoring, storage normalization, or
tenant migration until Packages A and B provide measured evidence.

## 22. Definition of success

This program succeeds when:

- `main` stays deployable through every phase;
- regulator identity and field accuracy do not regress;
- duplicate job execution is prevented by the database;
- web latency is independent of scraping and report load;
- result reads are bounded and paginated;
- source freshness and completeness are observable;
- accessibility is continuously tested;
- incidents can be traced across request, run, job, source, and revision;
- every migration has a tested rollback or safe forward-recovery path;
- scale claims are supported by reproducible load evidence.

