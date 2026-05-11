# Scraper Health Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single API endpoint that pings all 4 scrapers daily and emails an alert if any are degraded.

**Architecture:** One new route (`app/api/worker/scraper-health/route.ts`) authenticated via `WORKER_API_SECRET`, calls each scraper with a 7-day window wrapped in a 30-second timeout. One new email function (`sendScraperHealthAlert`) in `lib/email.ts`. No database, no dashboard.

**Tech Stack:** Next.js App Router, existing scraper functions, Resend email API

---

### Task 1: Add `sendScraperHealthAlert` to `lib/email.ts`

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Add the alert email function at the end of `lib/email.ts`**

After the closing brace of `sendSearchRunNotification` (after line 121), append:

```typescript
export interface ScraperHealthResult {
  source: string
  healthy: boolean
  itemCount: number
  error?: string
  warnings?: string[]
  durationMs: number
}

export async function sendScraperHealthAlert(
  results: ScraperHealthResult[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'
  const degraded = results.filter((r) => !r.healthy)

  const rows = results
    .map((r) => {
      const status = r.healthy ? '✅' : '❌'
      const detail = r.error ? escHtml(r.error) : r.warnings?.length ? escHtml(r.warnings.join('; ')) : ''
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #E2E8F0">${status} ${escHtml(r.source)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #E2E8F0">${r.itemCount} items</td>
        <td style="padding:6px 12px;border-bottom:1px solid #E2E8F0">${r.durationMs}ms</td>
        <td style="padding:6px 12px;border-bottom:1px solid #E2E8F0">${detail}</td>
      </tr>`
    })
    .join('\n')

  const subject = `[Neuridion] Scraper health alert — ${degraded.length} source${degraded.length !== 1 ? 's' : ''} degraded`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:600px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#0F1F3D">Neuridion</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  <p><strong>${degraded.length} of ${results.length} scrapers are degraded.</strong></p>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <tr style="background:#F8FAFC">
      <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #E2E8F0">Source</th>
      <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #E2E8F0">Results</th>
      <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #E2E8F0">Time</th>
      <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #E2E8F0">Detail</th>
    </tr>
    ${rows}
  </table>
  <p style="margin-top:20px;font-size:12px;color:#6B7280">Checked at ${new Date().toISOString()}</p>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: 'info@neuridion.eu', subject, html }),
  })
}
```

- [ ] **Step 2: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep email`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add scraper health alert email function

Co-Authored-By: Neuridion"
```

---

### Task 2: Create scraper health check endpoint

**Files:**
- Create: `app/api/worker/scraper-health/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/worker/scraper-health/route.ts` with:

```typescript
import { timingSafeEqual } from 'node:crypto'
import type { ScraperParams, ScraperResult } from '@/lib/scrapers/bfarm'
import { sendScraperHealthAlert, type ScraperHealthResult } from '@/lib/email'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const SCRAPERS: { source: string; fn: (p: ScraperParams) => Promise<ScraperResult> }[] = [
  { source: 'bfarm',      fn: async (p) => { const { scrapeBfarm } = await import('@/lib/scrapers/bfarm'); return scrapeBfarm(p) } },
  { source: 'fda',         fn: async (p) => { const { scrapeFdaMaude } = await import('@/lib/scrapers/fda-maude'); return scrapeFdaMaude(p) } },
  { source: 'mhra',        fn: async (p) => { const { scrapeMhra } = await import('@/lib/scrapers/mhra'); return scrapeMhra(p) } },
  { source: 'swissmedic',  fn: async (p) => { const { scrapeSwissmedic } = await import('@/lib/scrapers/swissmedic'); return scrapeSwissmedic(p) } },
]

const TIMEOUT_MS = 30_000

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ])
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-worker-secret')
  const expected = process.env.WORKER_API_SECRET
  if (!secret || !expected || !safeCompare(secret, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const to = new Date()
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
  const params: ScraperParams = {
    fromDate: from.toISOString().split('T')[0],
    toDate:   to.toISOString().split('T')[0],
  }

  const results: ScraperHealthResult[] = await Promise.all(
    SCRAPERS.map(async ({ source, fn }) => {
      const start = Date.now()
      try {
        const result = await withTimeout(fn(params), TIMEOUT_MS)
        const healthy = result.items.length > 0 && result.warnings.length === 0
        return {
          source,
          healthy,
          itemCount: result.items.length,
          warnings: result.warnings.length > 0 ? result.warnings : undefined,
          durationMs: Date.now() - start,
        }
      } catch (err) {
        return {
          source,
          healthy: false,
          itemCount: 0,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        }
      }
    }),
  )

  const degraded = results.filter((r) => !r.healthy)

  if (degraded.length > 0) {
    try {
      await sendScraperHealthAlert(results)
    } catch (emailErr) {
      console.error('[scraper-health] alert email failed:', emailErr)
    }
  }

  return Response.json({
    checked_at: new Date().toISOString(),
    period: { from: params.fromDate, to: params.toDate },
    healthy: degraded.length === 0,
    degraded_count: degraded.length,
    results,
  })
}
```

- [ ] **Step 2: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep scraper-health`

Expected: No errors.

- [ ] **Step 3: Verify the full build still passes**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/worker/scraper-health/route.ts
git commit -m "feat: add scraper health check endpoint with email alerts

Pings all 4 regulatory database scrapers with a 7-day window.
Sends alert email via Resend if any source returns 0 results,
throws, or times out (30s). Authenticated via WORKER_API_SECRET.

Co-Authored-By: Neuridion"
```

---

### Task 3: Push and verify

- [ ] **Step 1: Push to remote**

Run: `git push origin main`

- [ ] **Step 2: Verify clean state**

Run: `git log --oneline origin/main..HEAD`

Expected: Empty (all pushed).

- [ ] **Step 3: Document the curl command**

The endpoint is called with:

```bash
curl -H "x-worker-secret: $WORKER_API_SECRET" https://your-app.onrender.com/api/worker/scraper-health
```

Set this up as a Render cron job or a manual daily check.
