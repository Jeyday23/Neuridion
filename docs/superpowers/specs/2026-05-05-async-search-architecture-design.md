# Async Search Architecture Design

**Goal:** Replace the synchronous search pipeline (hard-limited to 100s by Cloudflare) with a QStash-driven async architecture that returns `run_id` immediately and uses client-side polling to detect completion — with correct `res.ok` checking that was missing in the previous attempt.

**Architecture:** POST enqueues to QStash and returns in <200ms. The QStash worker runs the pipeline (up to 15 min). The frontend polls GET every 3s, always checks `res.ok` before `res.json()`, and renders per-source progress live.

**Tech Stack:** Next.js 16 App Router, Upstash QStash (`@upstash/qstash`), Supabase PostgreSQL, React 19

**Root cause of previous failure:** The frontend polling loop called `res.json()` before checking `res.ok`. A non-200 response (auth error, Cloudflare 524, network blip) threw a `SyntaxError` that was swallowed silently — the interval was never cleared, the state never updated.

---

## 1. POST /api/search-runs Changes

**What changes:** The route stops running the pipeline inline and instead enqueues a QStash job.

**New flow:**
1. Auth check (unchanged)
2. Zod validation (unchanged)
3. Plan limit check (unchanged)
4. Profile ownership check (unchanged)
5. Insert `search_runs` row with `status: 'pending'`
6. Insert `search_job_queue` row, get `job_id`
7. Publish to QStash: `POST ${NEXT_PUBLIC_SITE_URL}/api/worker/process-job`, body `{ run_id, job_id, ...jobPayload }`, `retries: 3`, `timeout: 900`
8. On QStash publish failure: delete both rows, return 500
9. Return `{ run_id: run.id, status: 'pending' }` — no results, no counts

**Response shape (new):**
```json
{ "run_id": "uuid", "status": "pending" }
```

**Error responses** (unchanged from current):
- `400` — validation failed
- `401` — not authenticated
- `403` — plan limit exceeded
- `404` — profile not found
- `500` — DB insert or QStash publish failed

---

## 2. GET /api/search-runs/[id] Response Shape

**What changes:** Response is reshaped from `{ run, results }` (flat run row) to a typed response the frontend can use directly. Also fixes the `filter_decisions.model` → `model_used` column bug.

**New response shape:**

```typescript
// While pending or running (results empty):
{
  status:           'pending' | 'running',
  progress:         SearchProgress | null,  // null if not yet started
  results:          [],
  relevant_count:   0,
  uncertain_count:  0,
  excluded_count:   0,
  error:            null
}

// On completion:
{
  status:           'complete' | 'degraded',
  progress:         null,
  results:          FsnResult[],
  relevant_count:   number,
  uncertain_count:  number,
  excluded_count:   number,
  error:            string | null  // non-null for 'degraded'
}

// On failure:
{
  status:           'error',
  progress:         null,
  results:          [],
  relevant_count:   0,
  uncertain_count:  0,
  excluded_count:   0,
  error:            string
}
```

**SearchProgress shape** (already defined in `search-context.tsx`, matches what `run-search.ts` writes):
```typescript
{
  current_source: string | null   // null = AI filter phase
  sources_done:   string[]
  sources_total:  string[]
  items_found:    number
}
```

**`FsnResult` shape** (unchanged from current POST response):
```typescript
{
  id:              string
  title:           string
  manufacturer:    string
  fsn_date:        string | null
  source_url:      string
  source:          string           // source_db column
  filter_decision: {
    decision:   'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
    rationale:  string
    confidence: number | null
    model:      string | null       // reads model_used column
  } | null
}
```

**Bug fix included:** `filter_decisions` query changes from `.select('... model ...')` to `.select('... model_used ...')` with remapping to `model` in the response shape (to match the `FilterDecision` type the frontend already uses).

**Auth:** Uses `createClient()` (SSR with cookies) for ownership check. Uses `createAdminClient()` for data queries (bypasses RLS). Results only returned if `run.user_id === user.id`.

---

## 3. Frontend Polling Loop

**Location:** `runSearch()` in `app/dashboard/search/search-panel.tsx`

**Full flow:**

```
POST /api/search-runs
  → if !res.ok: handle error (see Error Handling below), return
  → parse JSON → { run_id }
  → setState({ phase: 'queued', runId: run_id, startedAt })
  → startPolling(run_id, startedAt)

startPolling(runId, startedAt):
  intervalRef = setInterval(poll, 3000)
  timeoutRef  = setTimeout(stopPolling('timeout'), 20 * 60 * 1000)

poll():
  res = await fetch(`/api/search-runs/${runId}`)
  
  if !res.ok:
    stopPolling()
    → 524 / 504 / 408 → error: "Search timed out. Try a shorter date range."
    → 401             → error: "Your session expired. Please refresh the page."
    → other           → error: `Error ${res.status} — please try again.`
    return

  data = await res.json()
  
  if data.status === 'pending' or 'running':
    setState({ phase: 'running', runId, startedAt, progress: data.progress })
    return  // keep polling

  if data.status === 'complete' or 'degraded':
    stopPolling()
    setState({ phase: 'done', runId, results: data.results, counts, startedAt })
    return

  if data.status === 'error' or 'failed':
    stopPolling()
    setState({ phase: 'error', message: data.error ?? 'Search failed.' })
    return

stopPolling(reason?):
  clearInterval(intervalRef)
  clearTimeout(timeoutRef)
  if reason === 'timeout':
    setState({ phase: 'error', message: 'Search is taking longer than expected. Check the Archive page for results once complete.' })
```

**Refs used:** `intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)`, `timeoutRef` same.

**Cleanup:** `useEffect` returns cleanup that calls `stopPolling()` on unmount — prevents memory leak if user navigates away mid-search.

---

## 4. Progress Card Data Flow

**Data flow:**
```
pipeline writes SearchProgress → search_runs.progress (jsonb)
                                       ↓
GET /api/search-runs/[id] returns progress field
                                       ↓
poll() → setState({ phase: 'running', progress: data.progress })
                                       ↓
SearchProgressCard receives { startedAt, progress }
```

**Progress card UI** — `SearchProgressCard` gains a `progress: SearchProgress | null` prop and renders:

```
┌─────────────────────────────────────────────────────────┐
│  ● Searching databases…                        1m 23s   │
├──────────────────────────────────────────────────────────┤
│  [indeterminate progress bar]                           │
├──────────────────────────────────────────────────────────┤
│  Sources:                                               │
│    ✓  BfArM           (done)                           │
│    ◌  MHRA            (scanning…)                      │
│    ·  FDA MAUDE       (pending)                        │
│    ·  Swissmedic      (pending)                        │
│                                                         │
│  156 items found so far                                 │
│                                                         │
│  ℹ Applying 2-stage AI relevance filter…  (tip rotates)│
└─────────────────────────────────────────────────────────┘
```

When `progress` is `null` (job pending, not yet started): show existing spinner + "Starting…" instead of source list.

When `current_source` is `null` (AI filter phase): all sources show ✓, message becomes "Running AI relevance filter…"

**Source name mapping** (already exists in `formatSourceLabel()`):
- `bfarm` → `BfArM`
- `mhra` → `MHRA`
- `fda` → `FDA MAUDE`
- `swissmedic` → `Swissmedic`

---

## 5. Terminal State Handling

| `data.status` | UI state | Action |
|---|---|---|
| `pending` | `running` (no progress) | Continue polling |
| `running` | `running` (with progress) | Continue polling, update progress |
| `complete` | `done` | Stop polling, show results |
| `degraded` | `done` | Stop polling, show results + degraded banner |
| `error` | `error` | Stop polling, show `data.error` message |
| `failed` | `error` | Stop polling, show `data.error` message |
| 20-min timeout | `error` | Stop polling, suggest checking Archive |
| `res.ok === false` | `error` | Stop polling, status-specific message |

**Degraded banner:** When `data.status === 'degraded'`, set phase to `done` but also pass `degraded: true` in state so results section can show: "Some databases returned partial results — results may be incomplete."

**`SearchRunState` type update needed:**
```typescript
| { phase: 'done'; runId: string; results: FsnResult[]; counts: {...}; startedAt: number; degraded?: boolean }
```

---

## 6. Files Changed

| File | Change |
|---|---|
| `app/api/search-runs/route.ts` | POST: drop pipeline call, add QStash enqueue, return `{run_id, status: 'pending'}` |
| `app/api/search-runs/[id]/route.ts` | GET: reshape response, fix `model_used` bug, return typed fields |
| `app/dashboard/search-context.tsx` | Add `degraded?: boolean` to `done` phase; `queued` phase already exists |
| `app/dashboard/search/search-panel.tsx` | Replace sync `await fetch` with polling loop; update `SearchProgressCard` to accept + render `progress` prop |

**Not changed:** `lib/pipeline/run-search.ts`, `app/api/worker/process-job/route.ts`, all migrations, all other routes.

---

## 7. Error Handling Summary

Every `fetch` call in the polling loop follows this pattern — no exceptions:

```typescript
const res = await fetch(url)
if (!res.ok) {
  // handle based on res.status — never call res.json() on error responses
  stopPolling()
  setState({ phase: 'error', message: friendlyMessage(res.status) })
  return
}
const data = await res.json()
// ... handle data
```

This is the fix for the root cause of the previous failure.
