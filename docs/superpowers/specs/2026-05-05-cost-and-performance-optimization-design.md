# Cost and Performance Optimization — Design Spec
**Date:** 2026-05-05
**Status:** Approved — pending implementation
**Author:** Jeremiah Matador + Claude

---

## Scope

Three independent optimizations, in priority order:

1. **Anthropic prompt caching** — reduce Sonnet input token spend via `cache_control`
2. **Database indexes** — one migration adding 8 missing indexes
3. **Async search pipeline** — Postgres-backed job queue + Render Background Worker + Supabase Realtime progress

Each can be implemented and shipped independently. Sections 1 and 2 are low-risk with no architectural change. Section 3 is the highest-impact and requires the most care.

---

## Section 1 — Anthropic Prompt Caching

### Problem

`sonnetFullFilter` in `lib/claude/filter-pipeline.ts` retransmits two static blobs on every API call:

- System prompt: ~120 tokens
- `FEW_SHOT_EXAMPLES` constant: ~400 tokens

On a run with 40 FSNs reaching Sonnet, these ~520 tokens are billed 40 times as fresh input. The Anthropic cache can eliminate 39 of those 40 billings at ~10% of input token cost — but only if the cacheable prefix reaches the **1,024-token minimum** required for `claude-sonnet-4-6`.

At 520 tokens, the current static content is below that threshold. Adding `cache_control` without addressing this would be silently ignored.

### Fix

**1. Expand the system prompt to ~1,100–1,300 tokens.**

Move `FEW_SHOT_EXAMPLES` into the system prompt and add legitimate regulatory context:

- EU MDR 2017/745 Art. 83–86 obligations (what PMS is, why FSN relevance matters)
- IVDR 2017/746 parallel obligations for in-vitro diagnostics
- Confidence scoring rubric (what 0.9 vs 0.6 vs 0.3 means clinically)
- Edge-case decision rules: same manufacturer / different device class, accessories and consumables, combination products, OEM/rebranded devices
- Output format contract (reinforces tool-use compliance)

This content is genuinely useful for classification quality. It is not padding.

**2. Apply two `cache_control` breakpoints.**

The system prompt content block gets `cache_control: { type: "ephemeral" }`. This caches everything up to and including the system prompt on the first call; subsequent calls within the 5-minute TTL hit the cache.

The first user message content block (the static `profileLines` string — identical for every FSN in a run against the same profile) also gets `cache_control: { type: "ephemeral" }`. This creates a second cache tier: the system prompt + profile context is stable across all FSNs in one run.

The second user message content block contains the FSN-specific variable data (title, manufacturer, date, content slice) and is never cached.

**3. Move the Anthropic client to a module-level singleton.**

Currently `new Anthropic()` is instantiated inside the retry closure on every call attempt. Move to a single module-level `const anthropic = new Anthropic()` to avoid re-initializing the HTTP client and connection pool on every invocation.

**Haiku.** Leave unchanged. Haiku's minimum cacheable prefix is 2,048 tokens — the pre-filter prompt is far below that. Haiku costs are also small relative to Sonnet; the ROI doesn't justify expanding its prompt.

**Batch API.** Not used in the main pipeline. The user expects near-real-time results. The Batch API (50% cost reduction, up to 24h turnaround) is a future option for bulk re-analysis of historical runs when a profile changes — out of scope here.

### Files Changed

| File | Change |
|---|---|
| `lib/claude/filter-pipeline.ts` | Expand system prompt; restructure user content into two blocks with `cache_control`; move Anthropic client to module singleton |

### Expected Impact

For a 40-FSN run where 30 items reach Sonnet: without caching, ~36,000 static tokens billed at input rate. With caching: ~1,200 tokens billed at input rate + ~34,800 at cache-read rate (~10% of input). Approximately **85–90% reduction in Sonnet static token spend** per run.

---

## Section 2 — Database Indexes

### Problem

Eight high-traffic query patterns have no supporting index. The most critical are the FK columns on `fsn_results` and `filter_decisions` (full table scans on every result page load) and `search_runs.status` (will become a hot poll target once the background worker is running).

### Migration: `023_performance_indexes.sql`

#### `fsn_results`

```
idx_fsn_results_run_id       ON fsn_results(search_run_id)
idx_fsn_results_canonical_id ON fsn_results(canonical_id)
idx_fsn_results_date         ON fsn_results(fsn_date)
```

- `search_run_id`: every result page load queries `WHERE search_run_id = $1`; this is the highest-traffic query in the app after auth
- `canonical_id`: FK with no supporting index; used in canonical dedup joins in `lib/sync/canonical.ts`
- `fsn_date`: archive page date-range filters

#### `filter_decisions`

```
idx_filter_decisions_run_id    ON filter_decisions(search_run_id)
idx_filter_decisions_result_id ON filter_decisions(fsn_result_id)
```

- Both are FK columns with no indexes; used in every run result load and in the count aggregation at the end of the search pipeline

#### `search_runs`

```
idx_search_runs_profile_id ON search_runs(profile_id)
idx_search_runs_status     ON search_runs(status)
```

- `profile_id`: profile detail page lists runs by profile; no index exists
- `status`: the background worker polls `WHERE status = 'pending'` every 3 seconds; without this index every poll is a full table scan

#### `fsn_canonical`

```
idx_fsn_canonical_date ON fsn_canonical(fsn_date)
```

- `getCanonicalItems` queries `WHERE source = $1 AND fsn_date BETWEEN $2 AND $3`; the `source` column benefits from the composite unique constraint already; `fsn_date` is unindexed

### Already Covered (no action needed)

`search_runs(user_id, created_at)` — migration 009
`filter_decision_cache(fsn_external_id, profile_fingerprint)` — migration 018
`sync_coverage(source)` — migration 021
`audit_log(user_id, created_at)`, `audit_log(event_type)` — migration 011

### Files Changed

| File | Change |
|---|---|
| `supabase/migrations/023_performance_indexes.sql` | New migration — 8 `CREATE INDEX IF NOT EXISTS` statements |

---

## Section 3 — Async Search Pipeline

### Problem

The search pipeline runs synchronously inside `POST /api/search-runs`. Multi-source runs (BfArM + FDA MAUDE) take 2–3 minutes. Render's web process subjects all HTTP requests to a timeout; runs regularly fail mid-execution or return incomplete results. There is no crash recovery — if Render restarts the instance mid-run, all in-progress work is lost.

### Solution: Postgres-backed job queue + Render Background Worker

The web process becomes fast (< 200ms response). A dedicated Background Worker process owns all pipeline execution. Supabase Realtime delivers live progress to the frontend without polling.

---

### New DB Table: `search_job_queue`

Migration `024_search_job_queue.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | job identity |
| `run_id` | `uuid → search_runs(id)` | CASCADE DELETE |
| `status` | `text` | `pending / running / completed / failed` |
| `payload` | `jsonb NOT NULL` | Full inputs: `{ profile_id, period_from, period_to, selected_dbs, user_id, force_refresh }` |
| `progress` | `jsonb` | `{ current_source, sources_done, sources_total, items_found }` — updated live |
| `worker_id` | `text` | Render instance ID that holds the lock |
| `locked_at` | `timestamptz` | When the worker claimed this job; used for stale-lock detection |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `error` | `text` | Last error message if `status = failed` |

RLS: service-role only (same pattern as `fsn_canonical`, `sync_coverage`).

Index: `(status, created_at)` — composite supports both the worker poll query and chronological admin views.

---

### Job Claiming — Distributed Locking

The worker claims jobs using a single atomic Postgres transaction:

```sql
BEGIN;
SELECT id, run_id, payload
FROM search_job_queue
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

UPDATE search_job_queue
SET status = 'running', worker_id = $worker_id, locked_at = NOW(), started_at = NOW()
WHERE id = $claimed_id;
COMMIT;
```

`SKIP LOCKED` means a second worker instance will skip any row already locked by another transaction. Two workers can never claim the same job.

---

### Crash Recovery

On worker startup (and on a configurable interval — every 5 minutes):

```sql
BEGIN;

-- Re-queue orphaned jobs
UPDATE search_job_queue
SET status = 'pending', worker_id = NULL, locked_at = NULL
WHERE status = 'running'
  AND locked_at < NOW() - INTERVAL '10 minutes'
RETURNING run_id;

-- Reset the corresponding search_runs rows so the frontend reflects pending state
UPDATE search_runs
SET status = 'pending'
WHERE id IN (
  SELECT run_id FROM search_job_queue
  WHERE status = 'pending'
    AND worker_id IS NULL
    AND locked_at IS NULL
    AND started_at < NOW() - INTERVAL '10 minutes'
);

COMMIT;
```

Any job stuck in `running` for more than 10 minutes is treated as orphaned and re-queued. Both `search_job_queue.status` and `search_runs.status` are reset to `pending` in the same transaction so the frontend and worker see a consistent state. The pipeline is already idempotent (canonical dedup + content-hash change detection in `lib/sync/canonical.ts`) so re-running a partial job produces correct, non-duplicated results.

---

### Progress Updates

The worker updates `search_job_queue.progress` after **each source completes** (not at the end). It also writes the same progress to `search_runs` so Supabase Realtime broadcasts it.

Progress shape per source completion:

```json
{
  "current_source": "fda",
  "sources_done": ["bfarm"],
  "sources_total": ["bfarm", "fda"],
  "items_found": 34
}
```

The frontend receives this update the moment the worker writes it, via the Realtime subscription (see Frontend Changes below).

---

### Pipeline Extraction: `lib/pipeline/run-search.ts`

The 350-line pipeline body currently inside `POST /api/search-runs` moves to a new shared module. It exports one function:

```typescript
runSearchPipeline(runId: string, payload: SearchJobPayload): Promise<void>
```

This function:
- Accepts the same inputs as the current POST body
- Emits progress by calling a `onProgress(update: ProgressUpdate)` callback
- Updates `search_runs` on completion or error
- Has no HTTP dependencies — it works identically whether called from the API route (legacy path, removed after cutover) or the worker

`app/api/search-runs/route.ts` is reduced to: auth check, plan limit check, row creation, job enqueue, return `{ run_id, status: "pending" }`.

---

### The Background Worker: `worker/search-runner.ts`

A Node.js process that runs as a Render **Background Worker** service. Start command: `npx tsx worker/search-runner.ts` (development parity) or compiled JS in production.

**Main loop:**

1. **Startup sweep** — re-queue orphaned stale jobs (the crash recovery query above)
2. **Poll** — every 3 seconds, attempt to claim one `pending` job via `SELECT FOR UPDATE SKIP LOCKED`
3. **If no job** — sleep 3 seconds, loop
4. **If job claimed:**
   - Update `search_runs.status = 'running'`
   - Call `runSearchPipeline(runId, payload)` with a progress callback that writes to both `search_job_queue.progress` and `search_runs.progress` (so Realtime fires)
   - On success: update job `status = completed`, `search_runs.status = complete/degraded`
   - On error: update job `status = failed`, `search_runs.status = error`, write error message

**Graceful shutdown (SIGTERM):**

Render sends SIGTERM before killing the process. The worker sets a `shuttingDown` flag. After the current source finishes, the worker releases the job lock (resets `status = pending`) and exits. The job re-queues cleanly on the next worker startup. No work is lost.

---

### Web Process Changes

**`POST /api/search-runs`** — new behavior:

1. Auth check (unchanged)
2. Plan limit check (unchanged)
3. Profile ownership check (unchanged)
4. Insert `search_runs` row with `status = 'pending'`
5. Insert `search_job_queue` row with full payload
6. Return `{ run_id, status: "pending" }` — done, < 200ms

**`GET /api/search-runs/[id]`** — existing endpoint, no structural change. It already returns the `search_runs` row. The `progress` field on `search_runs` (populated by the worker) is returned as part of this response for clients that want to poll instead of using Realtime.

---

### Frontend Changes

**Search page component (`app/dashboard/search/page.tsx` or equivalent):**

Current: `await fetch('/api/search-runs', { method: 'POST', ... })` → waits for full completion.

New:
1. POST returns immediately with `{ run_id }` — show "Search queued" state
2. Open a Supabase Realtime subscription on the `search_runs` row:

```typescript
supabase
  .channel(`run:${runId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'search_runs',
    filter: `id=eq.${runId}`,
  }, (payload) => {
    // payload.new contains updated status + progress
    setRunState(payload.new)
  })
  .subscribe()
```

3. Render progress from `run.progress`:
   - Sources done: green checkmarks
   - Current source: spinner with name ("Scraping FDA MAUDE...")
   - Items found so far: live counter
4. On `status = complete/degraded/error` — unsubscribe and show final results

Realtime is already enabled on the Supabase project (used elsewhere). No new infrastructure needed.

---

### Render Configuration (`render.yaml`)

Add a Background Worker service:

```yaml
- type: worker
  name: neuridion-search-worker
  env: node
  buildCommand: npm install
  startCommand: npx tsx worker/search-runner.ts
  envVars:
    - fromGroup: neuridion-env
```

Note: `npm run build` only compiles the Next.js app — it does not produce a `dist/worker/` output. The worker uses `tsx` for direct TypeScript execution, avoiding a separate compile step. If the project adopts a separate `tsc` build for the worker in future, the start command can switch to `node dist/worker/search-runner.js`.

The worker shares the same env var group as the web service — same Supabase URL, same Anthropic key, same Stripe keys. No secrets duplication.

On Render Starter plan, a Background Worker counts as one additional service instance. Within plan limits.

---

### Migration Summary for Section 3

| File | Purpose |
|---|---|
| `supabase/migrations/024_search_job_queue.sql` | New `search_job_queue` table with RLS + index |
| `supabase/migrations/025_search_runs_progress.sql` | Add `progress jsonb` column to `search_runs` so Realtime can broadcast it |

---

## Implementation Order

These are independent and can ship in any order. Recommended sequence:

1. **023 migration** (5 minutes, zero risk — indexes are additive)
2. **Prompt caching** (1–2 hours, isolated to `filter-pipeline.ts`)
3. **Pipeline extraction** to `lib/pipeline/run-search.ts` (refactor only, no behavior change — ship and verify)
4. **024 + 025 migrations** + worker implementation
5. **API route cutover** (POST now enqueues instead of runs inline)
6. **Frontend Realtime integration**

Steps 1–2 can ship to production immediately. Steps 3–6 should ship together as one PR after end-to-end testing.

---

## Out of Scope

- Batch API for historical re-analysis (future work)
- Connection pooling via PgBouncer (Supabase's connection pooler is on by default for projects on Pro plan; Starter uses direct connections — upgrading the Supabase plan is a separate decision)
- Horizontal worker scaling (one worker is sufficient at current volume; `SKIP LOCKED` supports adding more without code changes)
