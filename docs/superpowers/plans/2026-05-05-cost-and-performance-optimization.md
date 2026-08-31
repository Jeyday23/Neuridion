# Cost and Performance Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Anthropic prompt caching, 8 missing DB indexes, and a Postgres-backed async search pipeline with Render Background Worker and Supabase Realtime progress.

**Architecture:** A `search_job_queue` table holds pending/running jobs; a Render Background Worker (`worker/search-runner.ts`) claims jobs via `SELECT FOR UPDATE SKIP LOCKED` and calls the pipeline extracted to `lib/pipeline/run-search.ts`; `POST /api/search-runs` returns in < 200ms; the frontend subscribes to `search_runs` via Supabase Realtime for live per-source progress. Sonnet prompt caching with `cache_control` on the expanded system prompt (~1,200 tokens) and the per-run profile block reduces static token spend ~85–90% per run.

**Tech Stack:** Next.js 16, TypeScript, Supabase (PostgreSQL + Realtime), Anthropic SDK (`cache_control`), tsx (worker runtime), Render Background Worker

**Spec:** `docs/superpowers/specs/2026-05-05-cost-and-performance-optimization-design.md`

---

## File Map

**New files:**
- `supabase/migrations/023_performance_indexes.sql` — 8 indexes
- `supabase/migrations/024_search_job_queue.sql` — job queue table + `claim_next_job` + `requeue_stale_jobs` RPCs
- `supabase/migrations/025_search_runs_progress.sql` — `progress` column + Realtime publication
- `lib/pipeline/run-search.ts` — extracted search pipeline, called by worker and (temporarily) route
- `worker/search-runner.ts` — background worker process
- `app/api/search-runs/[id]/retry/route.ts` — re-queue a failed run
- `render.yaml` — Render web + worker service config

**Modified files:**
- `lib/claude/filter-pipeline.ts` — module-level Anthropic singleton + expanded system prompt + `cache_control`
- `app/api/search-runs/route.ts` — slim to enqueue-only, returns `{ run_id, status: "pending" }` in < 200ms
- `app/dashboard/search-context.tsx` — add `queued` and `running` (with progress) state phases
- `app/dashboard/search/search-panel.tsx` — Realtime subscription + per-source progress UI

---

## Task 1: Migration 023 — Performance Indexes

**Files:**
- Create: `supabase/migrations/023_performance_indexes.sql`

> Column name note: `fsn_results` uses `run_id` (confirmed by migration 010). `filter_decisions` uses `search_run_id` and `fsn_result_id`.

- [ ] **Step 1: Create the migration file**

```sql
-- 023_performance_indexes.sql
-- Performance indexes for high-traffic query patterns.

-- fsn_results: every result page load queries WHERE run_id = $1
CREATE INDEX IF NOT EXISTS idx_fsn_results_run_id
  ON public.fsn_results(run_id);

-- fsn_results: FK with no supporting index; used in canonical dedup joins
CREATE INDEX IF NOT EXISTS idx_fsn_results_canonical_id
  ON public.fsn_results(canonical_id);

-- fsn_results: archive page date-range filters
CREATE INDEX IF NOT EXISTS idx_fsn_results_date
  ON public.fsn_results(fsn_date);

-- filter_decisions: every run result load and count aggregation
CREATE INDEX IF NOT EXISTS idx_filter_decisions_run_id
  ON public.filter_decisions(search_run_id);

-- filter_decisions: FK with no supporting index; used in per-FSN decision joins
CREATE INDEX IF NOT EXISTS idx_filter_decisions_result_id
  ON public.filter_decisions(fsn_result_id);

-- search_runs: profile detail page lists runs by profile
CREATE INDEX IF NOT EXISTS idx_search_runs_profile_id
  ON public.search_runs(profile_id);

-- search_runs: background worker polls WHERE status = 'pending' every 3 seconds
CREATE INDEX IF NOT EXISTS idx_search_runs_status
  ON public.search_runs(status);

-- fsn_canonical: getCanonicalItems queries WHERE source = $1 AND fsn_date BETWEEN $2 AND $3
CREATE INDEX IF NOT EXISTS idx_fsn_canonical_date
  ON public.fsn_canonical(fsn_date);
```

- [ ] **Step 2: Apply the migration**

Via Supabase MCP `apply_migration`, or paste into the Supabase dashboard SQL editor and run.

- [ ] **Step 3: Verify all 8 indexes exist**

Run in the Supabase SQL editor:

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN (
  'idx_fsn_results_run_id',
  'idx_fsn_results_canonical_id',
  'idx_fsn_results_date',
  'idx_filter_decisions_run_id',
  'idx_filter_decisions_result_id',
  'idx_search_runs_profile_id',
  'idx_search_runs_status',
  'idx_fsn_canonical_date'
)
ORDER BY tablename, indexname;
```

Expected: 8 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/023_performance_indexes.sql
git commit -m "feat(db): add 8 performance indexes on fsn_results, filter_decisions, search_runs, fsn_canonical"
```

---

## Task 2: Migration 024 — Job Queue Table + RPCs

**Files:**
- Create: `supabase/migrations/024_search_job_queue.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 024_search_job_queue.sql
-- Postgres-backed job queue for async search pipeline execution.

CREATE TABLE IF NOT EXISTS public.search_job_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid        NOT NULL REFERENCES public.search_runs(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  payload      jsonb       NOT NULL,
  progress     jsonb,
  worker_id    text,
  locked_at    timestamptz,
  started_at   timestamptz,
  completed_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Composite index: worker polls WHERE status = 'pending' ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_job_queue_status_created
  ON public.search_job_queue(status, created_at);

ALTER TABLE public.search_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_job_queue"
  ON public.search_job_queue
  USING (false);

-- ── RPC: claim_next_job ───────────────────────────────────────────────────────
-- Atomically claims one pending job using SELECT FOR UPDATE SKIP LOCKED.
-- Returns the claimed row, or empty result set if no jobs are pending.

CREATE OR REPLACE FUNCTION public.claim_next_job(p_worker_id text)
RETURNS TABLE (id uuid, run_id uuid, payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT j.id INTO v_job_id
  FROM public.search_job_queue j
  WHERE j.status = 'pending'
  ORDER BY j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.search_job_queue
  SET
    status     = 'running',
    worker_id  = p_worker_id,
    locked_at  = NOW(),
    started_at = NOW()
  WHERE public.search_job_queue.id = v_job_id;

  RETURN QUERY
  SELECT j.id, j.run_id, j.payload
  FROM public.search_job_queue j
  WHERE j.id = v_job_id;
END;
$$;

-- ── RPC: requeue_stale_jobs ───────────────────────────────────────────────────
-- Resets jobs stuck in 'running' for longer than p_timeout_minutes.
-- Resets both search_job_queue and search_runs to 'pending' atomically.
-- Returns the count of jobs re-queued.

CREATE OR REPLACE FUNCTION public.requeue_stale_jobs(p_timeout_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count   integer;
  v_run_ids uuid[];
BEGIN
  WITH requeued AS (
    UPDATE public.search_job_queue
    SET status = 'pending', worker_id = NULL, locked_at = NULL
    WHERE status = 'running'
      AND locked_at < NOW() - (p_timeout_minutes || ' minutes')::interval
    RETURNING run_id
  )
  SELECT array_agg(run_id), COUNT(*)::integer
  INTO v_run_ids, v_count
  FROM requeued;

  IF v_count > 0 THEN
    UPDATE public.search_runs
    SET status = 'pending'
    WHERE id = ANY(v_run_ids);
  END IF;

  RETURN v_count;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Via Supabase MCP `apply_migration` or dashboard SQL editor.

- [ ] **Step 3: Verify table and RPCs**

```sql
-- Check columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'search_job_queue'
ORDER BY ordinal_position;

-- Check RPCs
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('claim_next_job', 'requeue_stale_jobs');
```

Expected: 10 columns, 2 routine rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/024_search_job_queue.sql
git commit -m "feat(db): add search_job_queue table with claim_next_job and requeue_stale_jobs RPCs"
```

---

## Task 3: Migration 025 — Progress Column + Realtime

**Files:**
- Create: `supabase/migrations/025_search_runs_progress.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 025_search_runs_progress.sql
-- Adds live progress column to search_runs for Supabase Realtime broadcast.

ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS progress jsonb;

-- Enable Realtime so the frontend can subscribe to per-row UPDATE events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_runs;
```

- [ ] **Step 2: Apply the migration**

Via Supabase MCP `apply_migration` or dashboard SQL editor.

- [ ] **Step 3: Verify**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'search_runs' AND column_name = 'progress';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/025_search_runs_progress.sql
git commit -m "feat(db): add progress column to search_runs and enable Supabase Realtime publication"
```

---

## Task 4: Prompt Caching

**Files:**
- Modify: `lib/claude/filter-pipeline.ts`

**Background:** Sonnet requires ≥ 1,024 tokens in the cacheable prefix for `cache_control` to trigger. The current combined system + few-shot content is ~520 tokens — below threshold. The fix moves `FEW_SHOT_EXAMPLES` into the system prompt, adds regulatory context to reach ~1,200 tokens, marks the system block with `cache_control: { type: 'ephemeral' }`, and adds a second breakpoint on the profile block (stable across all FSNs in one run). Also moves `new Anthropic()` to a module-level singleton.

- [ ] **Step 1: Replace the file header and add the expanded system prompt constant**

At the top of `lib/claude/filter-pipeline.ts`, replace lines 1–11 (imports + model constants) and the `FEW_SHOT_EXAMPLES` constant (lines 47–71) with the following. Everything else in the file stays unchanged for now:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { z } from 'zod'
import { callAnthropicWithRetry, callHaikuWithRetry } from './rate-limiter'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Models ────────────────────────────────────────────────────────────────────

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-4-6'

// ── Module-level singleton — avoids re-initialising HTTP client per call ──────

const anthropic = new Anthropic()

// ── System prompt ─────────────────────────────────────────────────────────────
// Target: ~1,200 tokens so the cache_control breakpoint clears the 1,024-token
// minimum required for claude-sonnet-4-6 prompt caching.
// Includes regulatory context, decision criteria, confidence rubric,
// edge-case rules, and the three few-shot examples.

const SYSTEM_PROMPT = `You are a medical device post-market surveillance (PMS) specialist. Your role is to assess whether a Field Safety Notice (FSN) or Field Safety Corrective Action (FSCA) is relevant to a specific product profile, in accordance with EU MDR 2017/745 and IVDR 2017/746.

REGULATORY CONTEXT

EU MDR 2017/745 Article 83 requires manufacturers to operate a post-market surveillance system proportionate to device risk class. Article 84 mandates a documented PMS plan. Article 85 (Class I) and Article 86 (Class IIa, IIb, III) require periodic reporting via Post-Market Surveillance Reports (PMSR) or Periodic Safety Update Reports (PSUR). FSNs published by other manufacturers are primary evidence for trend identification, proactive risk assessment, and PSUR updates — particularly where the FSN concerns a device with shared technology, clinical indication, or failure mode.

Article 87 covers manufacturer reporting of serious incidents and field safety corrective actions. Article 88 covers trend reporting. A manufacturer's PMS obligation extends to relevant similar-device information defined by the applicable PMS process — not only to the manufacturer's exact product line.

DECISION CRITERIA

"relevant" — The FSN concerns any of the following:
- The same device or a substantially equivalent device (same manufacturer, overlapping intended purpose, same core technology)
- A component, consumable, or accessory integral to the device's function in normal clinical use
- A device using the same primary mechanism of action (same energy source, same sensor principle, same drug-delivery pathway)
- A rebranded, OEM-supplied, or white-label version of the profiled device
- A device in the same EMDN/GMDN category where the failure mode is technology-generic

"uncertain" — The FSN concerns any of the following:
- A device in the same broad clinical domain but different technology class or intended purpose
- An accessory or peripheral with independent market distribution whose compatibility with the profiled device is plausible but unconfirmed
- A partially overlapping manufacturer name (subsidiary, acquired brand, OEM relationship possible but not confirmed)
- Insufficient FSN content to determine product overlap with confidence
- Same EMDN code, different intended purpose or patient population

"excluded" — The FSN concerns any of the following:
- A device with a completely different clinical domain, technology, or intended purpose
- A different manufacturer with no plausible technology, OEM, or subsidiary relationship
- A software-only device when the profile is hardware (or vice versa) with no combination-product relationship
- An IVD device when the profile is a therapeutic or surgical device, unless they form a combination product

CONFIDENCE SCORING

0.90–1.00  Clear manufacturer + product-name match; or same EMDN code + same mechanism of action
0.70–0.89  Same manufacturer, different product line; or same technology, different manufacturer
0.50–0.69  Same clinical domain, ambiguous technology overlap
0.30–0.49  Peripheral or accessory relationship — plausible but unconfirmed
0.10–0.29  Very weak signal; classify as uncertain with explicit reasoning

EDGE CASES

OEM / rebranded devices: If the FSN manufacturer is a known OEM supplier to the profiled device's manufacturer, classify as relevant even when product names differ.

Combination products: A drug-device combination FSN is relevant to the device component when that component matches the profiled device.

Accessories and consumables: Integral accessories (electrode pads, pump tubing, infusion sets) are relevant. Optional accessories with standalone market distribution require uncertain unless the FSN describes a failure mode that propagates to the primary device.

Platform devices: An FSN for a software module or algorithm that executes on a platform device is relevant to that platform.

EXAMPLES

EXAMPLE 1 — CLEARLY RELEVANT
Profile: MAGNETOM MRI Scanner, Siemens Healthineers (Class IIb)
FSN Title: "Urgent Safety Notice: MAGNETOM gradient coil overheating"
FSN Manufacturer: Siemens Healthineers
Decision: relevant
Rationale: Direct manufacturer and product-name match on primary device. The gradient coil is an integral part of the MAGNETOM system and this FSN has immediate PMS relevance.

EXAMPLE 2 — CLEARLY EXCLUDED
Profile: MAGNETOM MRI Scanner, Siemens Healthineers (Class IIb)
FSN Title: "Urgent Safety Notice: CGM CLINICAL insulin dosing app — incorrect dose calculation"
FSN Manufacturer: Roche Diagnostics
Decision: excluded
Rationale: Completely different device class (IVD software vs. imaging hardware) and entirely different clinical domain (diabetes management vs. diagnostic imaging). No plausible PMS overlap.

EXAMPLE 3 — UNCERTAIN (ADJACENT DEVICE)
Profile: MAGNETOM MRI Scanner, Siemens Healthineers (Class IIb)
FSN Title: "Resoundant Acoustic Driver System — vibration amplitude variance"
FSN Manufacturer: Resoundant Inc.
Decision: uncertain
Rationale: MRE acoustic driver hardware is routinely paired with MAGNETOM scanners in clinical MR elastography workflows. Different manufacturer, but this is a peripheral accessory to the device. Requires human review to determine PMS obligation.

Now assess the following FSN using the record_decision tool.`.trim()
```

- [ ] **Step 2: Rewrite `sonnetFullFilter` to use `cache_control` and the module-level client**

Replace the entire `sonnetFullFilter` function:

```typescript
async function sonnetFullFilter(
  fsn: FsnContext,
  profile: ProfileContext,
): Promise<FilterDecision> {
  const profileLines = [
    `Device: ${profile.device_name}`,
    `Manufacturer: ${profile.manufacturer}`,
    profile.emdn_code    ? `EMDN Code: ${profile.emdn_code}`       : null,
    profile.device_class ? `Device Class: ${profile.device_class}` : null,
    profile.intended_use ? `Intended Use: ${profile.intended_use}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const content = fsn.raw_content.slice(0, 2000)

  const parsed = await callAnthropicWithRetry(async () => {
    const response = await anthropic.messages.create({
      model:      SONNET_MODEL,
      max_tokens: 512,
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name:        'record_decision',
          description: 'Record the relevance decision for this FSN notice.',
          input_schema: {
            type: 'object' as const,
            properties: {
              decision:   { type: 'string', enum: ['relevant', 'uncertain', 'excluded'] },
              rationale:  { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['decision', 'rationale', 'confidence'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'record_decision' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type:          'text',
              text:          `Product Profile:\n${profileLines}`,
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text:
                `FSN Notice:\n` +
                `Title: ${fsn.title}\n` +
                `Manufacturer: ${fsn.manufacturer || 'Unknown'}\n` +
                `Date: ${fsn.fsn_date || 'Unknown'}\n` +
                `Content: ${content}`,
            },
          ],
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Model did not return a tool use block')
    }
    return FilterDecisionSchema.parse(toolUse.input)
  })

  return {
    decision:   parsed.decision,
    rationale:  parsed.rationale,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    model:      SONNET_MODEL,
  }
}
```

- [ ] **Step 3: Remove the old `FEW_SHOT_EXAMPLES` constant and the old `system:` string**

After the edits above, confirm that the file no longer contains:
- The `const FEW_SHOT_EXAMPLES = ...` block
- The old `system: \`You are a medical device...\`` string inside `sonnetFullFilter`
- Any `new Anthropic()` call inside a function body

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Confirm structure**

```bash
grep -n "cache_control\|ephemeral\|SYSTEM_PROMPT\|const anthropic" \
  lib/claude/filter-pipeline.ts
```

Expected: lines showing `const anthropic = new Anthropic()`, `SYSTEM_PROMPT`, `cache_control`, `ephemeral`.

- [ ] **Step 6: Commit**

```bash
git add lib/claude/filter-pipeline.ts
git commit -m "perf(ai): add prompt caching to Sonnet — expanded system prompt + cache_control on system and profile blocks + module-level client singleton"
```

---

## Task 5: Extract Pipeline to lib/pipeline/run-search.ts

**Background:** Pure refactor — no behavior change. Moves the 370-line pipeline body from the route into a shared module. The route continues working after this task by calling `runSearchPipeline` directly. The worker (Task 6) also calls it. The `onProgress` callback fires after each source completes, enabling live frontend updates.

**Files:**
- Create: `lib/pipeline/run-search.ts`

- [ ] **Step 1: Create `lib/pipeline/run-search.ts`**

```typescript
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeBfarm, type ScrapedFsn, type ScraperResult, type ScraperParams } from '@/lib/scrapers/bfarm'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { scrapeMhra }       from '@/lib/scrapers/mhra'
import { scrapeFdaMaude }   from '@/lib/scrapers/fda-maude'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { stage1Filter, getProfileFingerprint, type FilterDecision } from '@/lib/claude/filter-pipeline'
import { sendSearchRunNotification } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'
import { getCoveredRanges, computeUncoveredRanges, mergeCoverage, overlapWindowStart } from '@/lib/sync/coverage'
import { upsertCanonical, getCanonicalItems, computeContentHash } from '@/lib/sync/canonical'

// ── Public types ──────────────────────────────────────────────────────────────

export interface SearchJobPayload {
  profile_id:    string
  period_from:   string
  period_to:     string
  selected_dbs:  string[]
  user_id:       string
  force_refresh: boolean
}

export interface ProgressUpdate {
  current_source: string | null  // null = AI filtering phase
  sources_done:   string[]
  sources_total:  string[]
  items_found:    number
}

// ── Scraper registry ──────────────────────────────────────────────────────────

const SCRAPERS: Record<string, (p: ScraperParams) => Promise<ScraperResult>> = {
  bfarm:      scrapeBfarm,
  mhra:       scrapeMhra,
  fda:        scrapeFdaMaude,
  swissmedic: scrapeSwissmedic,
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runSearchPipeline(
  runId: string,
  payload: SearchJobPayload,
  onProgress?: (update: ProgressUpdate) => Promise<void>,
): Promise<void> {
  const db = createAdminClient()

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('device_name, manufacturer, intended_use, emdn_code, device_class')
    .eq('id', payload.profile_id)
    .single()
  if (profileError || !profile) throw new Error(`Profile ${payload.profile_id} not found`)

  const { period_from, period_to, force_refresh: forceRefresh } = payload
  const activeSources = payload.selected_dbs.filter((id) => SCRAPERS[id])
  if (activeSources.length === 0) activeSources.push('bfarm')

  const progressState: ProgressUpdate = {
    current_source: activeSources[0] ?? null,
    sources_done:   [],
    sources_total:  activeSources,
    items_found:    0,
  }

  interface SuccessfulSourceResult {
    sourceId:       string
    items:          ScrapedFsn[]
    warnings:       string[]
    contentChanged: Set<string>
    canonicalIds:   Map<string, string>
  }

  function prevDay(date: string): string {
    const d = new Date(date + 'T00:00:00.000Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  async function processSource(sourceId: string, sourceIndex: number): Promise<SuccessfulSourceResult> {
    const items:          ScrapedFsn[]        = []
    const warnings:       string[]            = []
    const contentChanged: Set<string>         = new Set()
    const canonicalIds:   Map<string, string> = new Map()
    const fetchedRanges:  { from: string; to: string }[] = []

    const searchTerms = buildManufacturerSearchTerms(
      profile.manufacturer ?? '',
      profile.device_name  ?? '',
    )

    async function fetchSourceRange(range: { from: string; to: string }): Promise<void> {
      const result = await SCRAPERS[sourceId]({
        fromDate:    range.from,
        toDate:      range.to,
        searchTerms: searchTerms.length > 0 ? searchTerms : undefined,
        profile:     {
          manufacturer: profile.manufacturer ?? '',
          device_name:  profile.device_name  ?? '',
        },
      })
      items.push(...result.items)
      warnings.push(...result.warnings)
      if (result.warnings.length === 0) fetchedRanges.push(range)
    }

    const overlapFrom = overlapWindowStart(period_to)

    if (forceRefresh) {
      await fetchSourceRange({ from: period_from, to: period_to })
    } else {
      const covered    = await getCoveredRanges(sourceId)
      const gapCheckTo = overlapFrom > period_from ? prevDay(overlapFrom) : period_from
      const uncovered  = computeUncoveredRanges(covered, period_from, gapCheckTo)

      for (const range of uncovered) {
        console.log(`[pipeline] ${sourceId}: fetching uncovered ${range.from} → ${range.to}`)
        await fetchSourceRange(range)
      }

      if (overlapFrom <= period_to) {
        console.log(`[pipeline] ${sourceId}: fetching overlap window ${overlapFrom} → ${period_to}`)
        await fetchSourceRange({ from: overlapFrom, to: period_to })
      }

      const mfrTerms = extractManufacturerTerms(profile.manufacturer ?? '')
      const devTerms = searchTerms.filter((t) => !mfrTerms.includes(t))
      const coveredInWindow = covered.filter(
        (c) => c.to >= period_from && c.from <= (overlapFrom > period_from ? prevDay(overlapFrom) : period_from),
      )

      for (const range of coveredInWindow) {
        const canonFrom = range.from < period_from ? period_from : range.from
        const canonTo   = range.to   > period_to   ? period_to   : range.to
        const cached    = await getCanonicalItems(sourceId, canonFrom, canonTo)
        const filtered  = searchTerms.length === 0 ? cached : cached.filter((item) => {
          const hay = `${item.title} ${item.manufacturer ?? ''} ${item.raw_content ?? ''}`.toLowerCase()
          if (devTerms.length === 0) return mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const mfrMatch = mfrTerms.length === 0 || mfrTerms.some((t) => hay.includes(t.toLowerCase()))
          const devMatch = devTerms.some((t) => hay.includes(t.toLowerCase()))
          return mfrMatch && devMatch
        })
        console.log(`[pipeline] ${sourceId}: ${filtered.length}/${cached.length} from canonical (${canonFrom} → ${canonTo})`)
        items.push(...filtered)
      }
    }

    const seen    = new Set<string>()
    const deduped = items.filter((item) => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })

    let canonicalPersisted = deduped.length === 0
    if (deduped.length > 0) {
      try {
        const results = await upsertCanonical(deduped)
        for (let i = 0; i < results.length; i++) {
          canonicalIds.set(deduped[i].external_id, results[i].canonical_id)
          if (results[i].content_changed) contentChanged.add(deduped[i].external_id)
        }
        canonicalPersisted = true
      } catch (err) {
        console.error(`[pipeline] ${sourceId}: canonical upsert failed:`, err)
      }
    }

    if (canonicalPersisted) {
      for (const range of fetchedRanges) await mergeCoverage(sourceId, range)
    }

    // Emit progress after this source completes — before moving to the next
    progressState.sources_done.push(sourceId)
    progressState.current_source = activeSources[sourceIndex + 1] ?? null
    progressState.items_found   += deduped.length
    if (onProgress) await onProgress({ ...progressState })

    return { sourceId, items: deduped, warnings, contentChanged, canonicalIds }
  }

  // ── Step 1: Scrape all sources ───────────────────────────────────────────────

  const sourceResults = await Promise.allSettled(
    activeSources.map((id, idx) => processSource(id, idx)),
  )

  const items:            ScrapedFsn[]    = []
  const allWarnings:      string[]        = []
  const allContentChanged = new Set<string>()
  const allCanonicalIds   = new Map<string, string>()

  for (let i = 0; i < sourceResults.length; i++) {
    const r = sourceResults[i]
    if (r.status === 'fulfilled') {
      items.push(...r.value.items)
      allWarnings.push(...r.value.warnings)
      r.value.contentChanged.forEach((id) => allContentChanged.add(id))
      r.value.canonicalIds.forEach((cid, eid) => allCanonicalIds.set(eid, cid))
    } else {
      console.error(`[pipeline] ${activeSources[i]} FAILED:`, r.reason)
    }
  }

  console.log(`[pipeline] Combined: ${items.length} items from ${activeSources.length} source(s)`)

  // ── Step 2: Insert fsn_results ───────────────────────────────────────────────

  let insertedRows: {
    id: string; external_id: string; title: string
    manufacturer: string; raw_content: string; fsn_date: string | null
  }[] = []

  if (items.length > 0) {
    const { data: inserted, error: insertError } = await db
      .from('fsn_results')
      .insert(items.map((item) => ({
        run_id:       runId,
        external_id:  item.external_id,
        title:        item.title,
        manufacturer: item.manufacturer ?? '',
        fsn_date:     item.fsn_date || null,
        source_url:   item.source_url,
        raw_content:  item.raw_content,
        source_db:    item.source_db,
        content_hash: computeContentHash(item),
        canonical_id: allCanonicalIds.get(item.external_id) ?? null,
      })))
      .select('id, external_id, title, manufacturer, raw_content, fsn_date')

    if (insertError) throw insertError
    insertedRows = inserted ?? []
  }

  // ── Step 3: AI filter ────────────────────────────────────────────────────────

  const fsnIdOf = (title: string) =>
    createHash('sha256').update(title.toLowerCase().trim()).digest('hex').slice(0, 32)

  const filterSearchTerms  = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const profileFingerprint = getProfileFingerprint(profile)
  const decisions: (FilterDecision & { fsn_result_id: string })[] = []

  let needsFilter = insertedRows

  if (insertedRows.length > 0) {
    const { data: cacheHits } = await db
      .from('filter_decision_cache')
      .select('fsn_external_id, decision, rationale, confidence, model_used')
      .in('fsn_external_id', insertedRows.map((r) => fsnIdOf(r.title)))
      .eq('profile_fingerprint', profileFingerprint)

    const cacheMap = new Map<string, {
      decision: string; rationale: string | null
      confidence: number | null; model_used: string | null
    }>()
    for (const hit of cacheHits ?? []) cacheMap.set(hit.fsn_external_id, hit)

    const alreadyCached: typeof insertedRows = []
    needsFilter = []

    for (const row of insertedRows) {
      const skipCache = allContentChanged.has(row.external_id ?? '')
      if (!skipCache && cacheMap.has(fsnIdOf(row.title))) {
        alreadyCached.push(row)
      } else {
        needsFilter.push(row)
      }
    }

    console.log(`[pipeline] cache hits: ${alreadyCached.length}/${insertedRows.length}`)
    for (const row of alreadyCached) {
      const hit = cacheMap.get(fsnIdOf(row.title))!
      decisions.push({
        fsn_result_id: row.id,
        decision:      hit.decision as FilterDecision['decision'],
        rationale:     hit.rationale ?? '',
        confidence:    hit.confidence != null ? hit.confidence / 100 : null,
        model:         hit.model_used ?? null,
      })
    }
  }

  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const deviceTerms       = filterSearchTerms.filter((t) => !manufacturerTerms.includes(t))
  let toFilter            = needsFilter

  if (filterSearchTerms.length > 0) {
    const mfrMatched:  typeof insertedRows = []
    const mfrExcluded: typeof insertedRows = []

    for (const row of needsFilter) {
      const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()
      let matches: boolean
      if (deviceTerms.length === 0) {
        matches = manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
      } else {
        const mfrMatch = manufacturerTerms.length === 0 || manufacturerTerms.some((t) => hay.includes(t.toLowerCase()))
        const devMatch = deviceTerms.some((t) => hay.includes(t.toLowerCase()))
        matches = mfrMatch && devMatch
      }
      if (matches) {
        mfrMatched.push(row)
      } else {
        mfrExcluded.push(row)
        decisions.push({
          fsn_result_id: row.id,
          decision:      'excluded',
          rationale:     'Manufacturer mismatch — not relevant to profile.',
          confidence:    0.95,
          model:         null,
        })
      }
    }

    console.log(`[pipeline] pre-filter: ${mfrMatched.length} pass, ${mfrExcluded.length} excluded`)
    toFilter = mfrMatched
  }

  for (let i = 0; i < toFilter.length; i++) {
    const row = toFilter[i]
    const d = await stage1Filter(
      { title: row.title, manufacturer: row.manufacturer, raw_content: row.raw_content, fsn_date: row.fsn_date },
      profile,
      { skipCache: true },
    )
    decisions.push({ ...d, fsn_result_id: row.id })
    if ((i + 1) % 25 === 0) {
      console.log(`[pipeline] AI filter: ${i + 1}/${toFilter.length}`)
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  // ── Step 4: Insert filter_decisions ─────────────────────────────────────────

  if (decisions.length > 0) {
    const { error: decisionsError } = await db.from('filter_decisions').insert(
      decisions.map((d) => ({
        fsn_result_id: d.fsn_result_id,
        search_run_id: runId,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence,
        model_used:    d.model,
        stage:         'stage1',
      })),
    )
    if (decisionsError) throw decisionsError
  }

  // ── Step 5: Finalise run ─────────────────────────────────────────────────────

  const counts = decisions.reduce(
    (acc, d) => { acc[d.decision] = (acc[d.decision] ?? 0) + 1; return acc },
    { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>,
  )

  const runStatus = allWarnings.length > 0 ? 'degraded' : 'complete'

  await db.from('search_runs').update({
    status:              runStatus,
    error:               allWarnings.length > 0 ? allWarnings.join('\n') : null,
    completed_at:        new Date().toISOString(),
    relevant_count:      counts.relevant,
    uncertain_count:     counts.uncertain,
    excluded_count:      counts.excluded,
    filter_failed_count: counts.filter_failed,
    progress:            null,
  }).eq('id', runId)

  // ── Step 6: Audit log ────────────────────────────────────────────────────────

  await logAuditEvent(payload.user_id, 'search_run', {
    run_id:         runId,
    profile_id:     payload.profile_id,
    result_count:   items.length,
    relevant_count: counts.relevant,
  })

  // ── Step 7: Email notification (paid plans only, fire-and-forget) ────────────

  const { data: userData } = await db
    .from('users')
    .select('email, plan')
    .eq('id', payload.user_id)
    .single()

  if (userData?.email && userData.plan !== 'free' && process.env.RESEND_API_KEY) {
    sendSearchRunNotification(userData.email, {
      deviceName:     profile.device_name,
      manufacturer:   profile.manufacturer,
      periodFrom:     period_from,
      periodTo:       period_to,
      relevantCount:  counts.relevant,
      uncertainCount: counts.uncertain,
      excludedCount:  counts.excluded,
      runId,
    }).catch((err) => console.error('[pipeline] Email notification failed:', err))
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/run-search.ts
git commit -m "refactor(pipeline): extract search pipeline to lib/pipeline/run-search.ts with onProgress callback"
```

---

## Task 6: Background Worker

**Files:**
- Create: `worker/search-runner.ts`
- Create: `render.yaml`

- [ ] **Step 1: Create `worker/search-runner.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { runSearchPipeline, type SearchJobPayload, type ProgressUpdate } from '@/lib/pipeline/run-search'
import { randomUUID } from 'crypto'

const POLL_INTERVAL_MS          = 3_000
const STALE_JOB_TIMEOUT_MINUTES = 10

const workerId   = `worker-${randomUUID()}`
let shuttingDown = false

process.on('SIGTERM', () => {
  console.log('[worker] SIGTERM received — will stop after current job completes')
  shuttingDown = true
})
process.on('SIGINT', () => { shuttingDown = true })

async function main(): Promise<void> {
  console.log(`[worker] Starting. ID: ${workerId}`)
  const db = createAdminClient()

  // On startup, re-queue any jobs orphaned by a previous crashed instance
  const { data: requeuedCount } = await db.rpc('requeue_stale_jobs', {
    p_timeout_minutes: STALE_JOB_TIMEOUT_MINUTES,
  })
  if ((requeuedCount ?? 0) > 0) {
    console.log(`[worker] Re-queued ${requeuedCount} stale job(s)`)
  }

  while (!shuttingDown) {
    try {
      const { data: claimed, error: claimError } = await db.rpc('claim_next_job', {
        p_worker_id: workerId,
      })

      if (claimError) {
        console.error('[worker] claim_next_job error:', claimError.message)
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      if (!claimed || claimed.length === 0) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const job = claimed[0] as { id: string; run_id: string; payload: SearchJobPayload }
      console.log(`[worker] Claimed job ${job.id} for run ${job.run_id}`)

      await db.from('search_runs').update({
        status:     'running',
        started_at: new Date().toISOString(),
      }).eq('id', job.run_id)

      try {
        await runSearchPipeline(
          job.run_id,
          job.payload,
          async (update: ProgressUpdate) => {
            // Write to job queue (internal state) and search_runs (Realtime broadcast)
            await db.from('search_job_queue').update({ progress: update }).eq('id', job.id)
            await db.from('search_runs').update({ progress: update }).eq('id', job.run_id)
          },
        )

        await db.from('search_job_queue').update({
          status:       'completed',
          completed_at: new Date().toISOString(),
          progress:     null,
        }).eq('id', job.id)

        console.log(`[worker] Job ${job.id} completed`)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[worker] Job ${job.id} failed:`, errMsg)

        await db.from('search_job_queue').update({
          status:       'failed',
          error:        errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id)

        await db.from('search_runs').update({
          status:       'error',
          error:        errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', job.run_id)
      }
    } catch (err) {
      console.error('[worker] Poll loop error:', err)
      await sleep(POLL_INTERVAL_MS)
    }
  }

  console.log('[worker] Shut down cleanly')
  process.exit(0)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Create `render.yaml`**

```yaml
services:
  - type: web
    name: neuridion-web
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVarGroups:
      - neuridion-env

  - type: worker
    name: neuridion-search-worker
    env: node
    buildCommand: npm install
    startCommand: npx tsx worker/search-runner.ts
    envVarGroups:
      - neuridion-env
```

> **Note:** `envVarGroups` must match the group name configured in your Render dashboard. Adjust the name if different. The worker shares all env vars with the web service — same Supabase URL, Anthropic key, etc.

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add worker/search-runner.ts render.yaml
git commit -m "feat(worker): add Postgres-backed background worker for async search pipeline"
```

---

## Task 7: Refactor POST /api/search-runs

**Background:** Route slims to auth + plan check + profile check + create run (`status: 'pending'`) + enqueue job + return `{ run_id, status: 'pending' }`. Removes the `maxDuration = 1800` export (no longer needed — the route returns in < 200ms).

**Files:**
- Modify: `app/api/search-runs/route.ts`

- [ ] **Step 1: Replace the entire file contents**

```typescript
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS, type PlanId } from '@/lib/plans'
import { type SearchJobPayload } from '@/lib/pipeline/run-search'
import { z } from 'zod'

const KNOWN_SOURCES  = ['bfarm', 'mhra', 'fda', 'swissmedic']
const ISO_DATE       = /^\d{4}-\d{2}-\d{2}$/
const MAX_SPAN_YEARS = 5

const SearchRunBodySchema = z.object({
  profile_id:    z.string().uuid(),
  period_from:   z.string().regex(ISO_DATE, 'period_from must be YYYY-MM-DD'),
  period_to:     z.string().regex(ISO_DATE, 'period_to must be YYYY-MM-DD'),
  selected_dbs:  z.array(z.enum(KNOWN_SOURCES as [string, ...string[]])).min(1).max(KNOWN_SOURCES.length).optional(),
  force_refresh: z.boolean().optional(),
}).superRefine((val, ctx) => {
  const from = new Date(val.period_from)
  const to   = new Date(val.period_to)
  if (isNaN(from.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_from is not a valid date', path: ['period_from'] }); return
  }
  if (isNaN(to.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_to is not a valid date', path: ['period_to'] }); return
  }
  if (from > to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_from must be on or before period_to', path: ['period_from'] })
  }
  const maxSpanMs = MAX_SPAN_YEARS * 365.25 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxSpanMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Date range may not exceed ${MAX_SPAN_YEARS} years`, path: ['period_to'] })
  }
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const db       = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const bodyResult = SearchRunBodySchema.safeParse(rawBody)
  if (!bodyResult.success) {
    return Response.json({ error: bodyResult.error.issues.map((i) => i.message).join('; ') }, { status: 400 })
  }

  const { profile_id, period_from, period_to, selected_dbs, force_refresh } = bodyResult.data

  // Plan limit check
  const { data: userData } = await supabase.from('users').select('plan').eq('id', user.id).single()
  const userPlan = ((userData?.plan ?? 'free') as PlanId)
  const runLimit = PLANS[userPlan].maxSearchRuns
  if (runLimit !== -1) {
    const { count: runCount } = await supabase
      .from('search_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((runCount ?? 0) >= runLimit) {
      return Response.json(
        { error: `Your ${PLANS[userPlan].label} plan allows ${runLimit} search run${runLimit === 1 ? '' : 's'}. Upgrade to run more searches.` },
        { status: 403 },
      )
    }
  }

  // Profile ownership check
  const { data: profile, error: profileError } = await supabase
    .from('product_profiles')
    .select('id')
    .eq('id', profile_id)
    .eq('user_id', user.id)
    .single()
  if (profileError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Create the search run in pending state
  const { data: run, error: runError } = await db
    .from('search_runs')
    .insert({
      profile_id,
      user_id:            user.id,
      status:             'pending',
      search_period_from: period_from,
      search_period_to:   period_to,
      period_from,
      period_to,
    })
    .select()
    .single()
  if (runError) {
    return Response.json({ error: runError.message }, { status: 500 })
  }

  // Enqueue the job
  const jobPayload: SearchJobPayload = {
    profile_id,
    period_from,
    period_to,
    selected_dbs:  selected_dbs ?? ['bfarm'],
    user_id:       user.id,
    force_refresh: force_refresh ?? false,
  }
  const { error: queueError } = await db.from('search_job_queue').insert({
    run_id:  run.id,
    payload: jobPayload,
  })
  if (queueError) {
    // Roll back the run row so the user doesn't see a ghost run
    await db.from('search_runs').delete().eq('id', run.id)
    return Response.json({ error: 'Failed to enqueue search job' }, { status: 500 })
  }

  return Response.json({ run_id: run.id, status: 'pending' }, { status: 201 })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/search-runs/route.ts
git commit -m "feat(api): refactor search-runs POST to enqueue async job — returns run_id immediately"
```

---

## Task 8: Retry Endpoint

**Files:**
- Create: `app/api/search-runs/[id]/retry/route.ts`

- [ ] **Step 1: Create the retry route**

```typescript
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type SearchJobPayload } from '@/lib/pipeline/run-search'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await params
  const supabase = await createClient()
  const db       = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify ownership and current status
  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('id, user_id, status, period_from, period_to, profile_id')
    .eq('id', runId)
    .eq('user_id', user.id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'error' && run.status !== 'failed') {
    return Response.json(
      { error: `Cannot retry a run with status "${run.status}". Only failed or errored runs can be retried.` },
      { status: 409 },
    )
  }

  // Recover the original payload so selected_dbs and force_refresh are preserved
  const { data: existingJob } = await db
    .from('search_job_queue')
    .select('payload')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const payload: SearchJobPayload = existingJob?.payload ?? {
    profile_id:    run.profile_id,
    period_from:   run.period_from,
    period_to:     run.period_to,
    selected_dbs:  ['bfarm'],
    user_id:       user.id,
    force_refresh: false,
  }

  // Reset the run to pending
  const { error: resetError } = await db.from('search_runs').update({
    status:       'pending',
    error:        null,
    completed_at: null,
    started_at:   null,
    progress:     null,
  }).eq('id', runId)

  if (resetError) {
    return Response.json({ error: 'Failed to reset run status' }, { status: 500 })
  }

  // Enqueue a fresh job
  const { error: queueError } = await db.from('search_job_queue').insert({
    run_id:  runId,
    payload,
  })

  if (queueError) {
    // Restore error status so the user can try again
    await db.from('search_runs').update({ status: 'error' }).eq('id', runId)
    return Response.json({ error: 'Failed to enqueue retry job' }, { status: 500 })
  }

  return Response.json({ run_id: runId, status: 'pending' }, { status: 200 })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/search-runs/[id]/retry/route.ts
git commit -m "feat(api): add POST /api/search-runs/[id]/retry to re-queue failed runs"
```

---

## Task 9: Frontend — Realtime Subscription + Progress UI

**Files:**
- Modify: `app/dashboard/search-context.tsx`
- Modify: `app/dashboard/search/search-panel.tsx`

- [ ] **Step 1: Replace `app/dashboard/search-context.tsx`**

```typescript
'use client'

import { createContext, useContext, useState } from 'react'

interface FilterDecision {
  decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
  rationale: string
  confidence: number | null
  model: string | null
}

export interface FsnResult {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source: string
  filter_decision: FilterDecision | null
}

export interface SearchProgress {
  current_source: string | null
  sources_done:   string[]
  sources_total:  string[]
  items_found:    number
}

export type SearchRunState =
  | { phase: 'idle' }
  | { phase: 'queued';  runId: string; startedAt: number }
  | { phase: 'running'; runId: string; startedAt: number; progress: SearchProgress | null }
  | { phase: 'done';    runId: string; results: FsnResult[]; counts: { relevant: number; uncertain: number; excluded: number }; startedAt: number }
  | { phase: 'error';   message: string }

interface SearchContextValue {
  searchState: SearchRunState
  setSearchState: (s: SearchRunState) => void
}

const SearchContext = createContext<SearchContextValue>({
  searchState: { phase: 'idle' },
  setSearchState: () => {},
})

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [searchState, setSearchState] = useState<SearchRunState>({ phase: 'idle' })
  return (
    <SearchContext.Provider value={{ searchState, setSearchState }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearchContext() {
  return useContext(SearchContext)
}
```

- [ ] **Step 2: Replace the `runSearch` function in `app/dashboard/search/search-panel.tsx`**

Find the `async function runSearch()` (currently around line 387) and replace it with:

```typescript
async function runSearch() {
  if (!profileId) return
  setReportState({ phase: 'idle' })
  setExpandedIds(new Set())
  setFilterTab('all')

  // POST enqueues the job and returns immediately with run_id
  let runId: string
  try {
    const res  = await fetch('/api/search-runs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        profile_id:   profileId,
        period_from:  fromDate,
        period_to:    toDate,
        selected_dbs: [...selectedDbs],
      }),
    })
    const data = await res.json() as { run_id?: string; error?: string }
    if (!res.ok) {
      setState({ phase: 'error', message: data.error ?? 'Search failed.' })
      return
    }
    runId = data.run_id!
    setState({ phase: 'queued', runId, startedAt: Date.now() })
  } catch (err) {
    setState({ phase: 'error', message: String(err) })
    return
  }

  // Subscribe to Realtime updates on this search_runs row.
  // The worker writes to search_runs.progress after each source and
  // sets search_runs.status to complete/degraded/error when done.
  const supabase = createClient()
  const channel  = supabase
    .channel(`run:${runId}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'search_runs',
        filter: `id=eq.${runId}`,
      },
      async (payload) => {
        const row = payload.new as {
          status:          string
          progress:        { current_source: string | null; sources_done: string[]; sources_total: string[]; items_found: number } | null
          relevant_count:  number
          uncertain_count: number
          excluded_count:  number
          error:           string | null
        }

        if (row.status === 'running') {
          setState({
            phase:     'running',
            runId,
            startedAt: state.phase === 'queued' || state.phase === 'running' ? state.startedAt : Date.now(),
            progress:  row.progress ?? null,
          })
          return
        }

        if (row.status === 'complete' || row.status === 'degraded') {
          channel.unsubscribe()
          try {
            const detailRes = await fetch(`/api/search-runs/${runId}`)
            const detail    = await detailRes.json() as { results?: FsnResult[]; error?: string }
            if (!detailRes.ok) {
              setState({ phase: 'error', message: detail.error ?? 'Failed to load results.' })
              return
            }
            setState({
              phase:     'done',
              runId,
              results:   detail.results ?? [],
              counts:    {
                relevant:  row.relevant_count  ?? 0,
                uncertain: row.uncertain_count ?? 0,
                excluded:  row.excluded_count  ?? 0,
              },
              startedAt: state.phase === 'queued' || state.phase === 'running' ? state.startedAt : Date.now(),
            })
          } catch (err) {
            setState({ phase: 'error', message: String(err) })
          }
          return
        }

        if (row.status === 'error' || row.status === 'failed') {
          channel.unsubscribe()
          setState({ phase: 'error', message: row.error ?? 'Search run failed.' })
        }
      },
    )
    .subscribe()
}
```

- [ ] **Step 3: Add the progress display block to the JSX**

Find the section in the JSX that currently renders the loading state for `state.phase === 'running'` (around line 620–640). Replace it with:

```tsx
{(state.phase === 'queued' || state.phase === 'running') && (
  <div className="mt-6 space-y-3">
    <div className="flex items-center gap-3 text-slate-600">
      <Loader2 className="w-5 h-5 animate-spin text-teal-600 shrink-0" />
      <span className="text-sm font-medium">
        {state.phase === 'queued'
          ? 'Search queued…'
          : (state.progress?.current_source
              ? `Scraping ${formatSourceLabel(state.progress.current_source)}…`
              : 'Running AI filter…'
            )
        }
      </span>
    </div>

    {state.phase === 'running' && state.progress && (
      <div className="space-y-1.5 pl-8">
        {state.progress.sources_total.map((src) => {
          const done   = state.progress!.sources_done.includes(src)
          const active = state.progress!.current_source === src
          return (
            <div key={src} className="flex items-center gap-2 text-sm text-slate-500">
              {done
                ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                : active
                  ? <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
                  : <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              }
              <span className={
                done   ? 'text-green-700' :
                active ? 'text-teal-700 font-medium' :
                         'text-slate-400'
              }>
                {formatSourceLabel(src)}
              </span>
            </div>
          )
        })}
        {state.progress.items_found > 0 && (
          <p className="text-xs text-slate-400 pt-1 pl-6">
            {state.progress.items_found} notices found so far
          </p>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Update the run button's `disabled` prop**

Find the run button (around line 621). Change:

```tsx
disabled={noProfiles || state.phase === 'running' || isOverLimit}
```

to:

```tsx
disabled={noProfiles || state.phase === 'queued' || state.phase === 'running' || isOverLimit}
```

Also update the button label — currently it likely reads `state.phase === 'running'` to show a loading label. Extend that condition:

```tsx
{(state.phase === 'queued' || state.phase === 'running')
  ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching…</>
  : 'Run Search'
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/jeremiahmatador/NEURIDION && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Start dev server and verify end-to-end**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/search`. With the worker also running in a separate terminal (`npx tsx worker/search-runner.ts`), run a search with two active sources. Verify:

1. Button disables immediately, shows "Searching…" spinner
2. "Search queued…" state appears within ~200ms
3. Transitions to "Scraping BfArM…" with per-source list when worker picks up the job
4. BfArM row shows a green checkmark when done, MHRA row shows spinner
5. "Running AI filter…" appears after all sources complete
6. Results render when `status = complete`

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/search-context.tsx app/dashboard/search/search-panel.tsx
git commit -m "feat(frontend): Supabase Realtime subscription + per-source progress UI for async search"
```

---

## Self-Review

| Spec requirement | Task |
|---|---|
| Prompt caching on Sonnet system prompt + few-shot examples | Task 4 |
| Module-level Anthropic singleton | Task 4 |
| Leave Haiku unchanged | Task 4 (Haiku untouched) |
| 8 missing DB indexes | Task 1 |
| `search_job_queue` table with RLS | Task 2 |
| `claim_next_job` RPC with `FOR UPDATE SKIP LOCKED` | Task 2 |
| `requeue_stale_jobs` RPC — atomic reset of both tables | Task 2 |
| `progress` column on `search_runs` + Realtime | Task 3 |
| Pipeline extraction to `lib/pipeline/run-search.ts` | Task 5 |
| `onProgress` fires after **each source** completes | Task 5 — fires at end of `processSource` before `Promise.allSettled` returns per-source result |
| Background worker with 3-second poll | Task 6 |
| SIGTERM graceful shutdown — finishes current job | Task 6 |
| 10-minute stale job timeout | Task 6 |
| Route returns in < 200ms | Task 7 |
| `POST /api/search-runs/[id]/retry` endpoint | Task 8 |
| Frontend Realtime subscription on `search_runs` | Task 9 |
| Per-source progress list with live checkmarks | Task 9 |
| `render.yaml` with Background Worker service | Task 6 |

> **`onProgress` and `Promise.allSettled`:** Note that `processSource` calls `onProgress` before returning, and all sources run concurrently via `Promise.allSettled`. This means progress updates may arrive slightly out of order if two sources finish close together — this is acceptable and the UI handles it correctly by treating `sources_done` as a set.
