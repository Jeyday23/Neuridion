@AGENTS.md

# CLAUDE.md — Kodex Medical PMS ("PMS in Seconds")

> **IMPORTANT — READ THIS FIRST**
> Your job right now is to LEARN this project, not build or change anything.
> Do NOT create, edit, or delete any application files unless Jeremiah explicitly
> says: "Build this" / "Make this change" / "Fix this" / "You can now modify files."
> Until then: read, understand, and answer questions only.

---

## Development Workflow — MANDATORY

These rules apply to every session, every task, every change — no exceptions.

**Before any code, file creation, or edit:**

1. **`superpowers:brainstorming`** — before any new feature or architectural decision
2. **`superpowers:writing-plans`** — before any implementation; break into 2–5 minute tasks with exact file paths and verification steps
3. **`superpowers:subagent-driven-development`** — execute the plan task-by-task with review between each task
4. **`superpowers:systematic-debugging`** — before any bug fix; gather evidence and verify root cause before touching code
5. **`superpowers:test-driven-development`** — write failing test first, then implement, then verify green
6. **`superpowers:requesting-code-review`** — after each task completes, review before moving to next
7. **`context7`** — fetch current documentation for any library before using it (Supabase, Next.js, QStash, Anthropic SDK)

**Hard rules:**
- Never skip straight to writing code
- Never assume library APIs from training data — always verify with context7 first
- Never mark a task complete without TypeScript check passing
- Never proceed to next task without reviewing current task

---

## Project Overview

**PMS in Seconds** is a full-stack, AI-powered Post-Market Surveillance tool for medical device
manufacturers. It automatically monitors regulatory databases for Field Safety Notices (FSNs),
runs AI relevance filtering against user-defined device profiles, and generates compliance reports.

- **GitHub:** https://github.com/Jeyday23/Kodex-4-Medical
- **Contact:** info@neuridion.eu
- **Owner:** Jeremiah

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL (Supabase JS client) |
| AI | Anthropic AI SDK (`@anthropic-ai/sdk`) |
| Payments | Stripe (`stripe` + `@stripe/stripe-js`) |
| Email | Resend |
| PDF | PDFShift (external API, not Puppeteer) |
| Excel | ExcelJS |
| QR Codes | `qrcode` |
| HL7 / XML | `xml2js` |
| Styling | Tailwind CSS v4, `clsx`, `tailwind-merge` (`cn()`) |
| Icons | `lucide-react` |
| Validation | Zod v4 |
| Date utils | `date-fns` |
| Tests | Vitest (`__tests__/`) |

> **Note:** Puppeteer is listed in package.json but PDF generation uses PDFShift (HTTP API).
> The `PDFSHIFT_API_KEY` env var controls access.

---

## Folder Structure

```
/app
  /api                   — All API routes (REST handlers)
    /account             — GDPR: data export, account deletion
    /admin               — Admin-only: trial codes, user management
    /auth/logout         — POST to sign out
    /billing             — Stripe checkout + portal
    /claim/[code]        — QR trial code redemption
    /consent/cookies     — Cookie consent recording
    /feedback            — User feedback submission
    /profiles/[id]       — PATCH (update) + DELETE profile
    /profiles/[id]/stats — GET run count for a profile (used before delete confirm)
    /profiles            — GET/POST product profiles
    /reports             — POST generate report; GET/download
    /search-drafts       — Save/load search configuration drafts
    /search-runs         — POST start a run; GET list
    /search-runs/[id]    — GET run + results; DELETE run
    /search-runs/[id]/cancel — POST cancel a running/queued run
    /stripe/webhook      — Legacy Stripe webhook path
    /webhooks/stripe     — Active Stripe webhook handler
  /admin                 — Admin dashboard (feedback, QR codes, users, runs)
  /claim/[code]          — Public QR code claim page
  /components            — Shared UI: CookieBanner, FeedbackPopup, Footer, PrototypeBanner
  /dashboard
    /archive             — Search run history table + per-run results
    /billing             — Subscription management
    /profiles            — Product profile list, create, edit
    /search              — Main search panel
    /settings            — User settings

/lib
  /claude                — AI pipeline: filter-pipeline.ts, rate-limiter.ts
  /scrapers              — bfarm.ts, fda-maude.ts, mhra.ts, swissmedic.ts
  /search                — manufacturer-terms.ts (token extraction for search narrowing)
  /supabase              — server.ts, client.ts, admin.ts
  /sync                  — canonical.ts, coverage.ts (dedup + incremental coverage)
  /utils                 — date-chunks.ts
  audit.ts               — Writes to audit_log table
  email.ts               — Resend email wrapper
  i18n.ts                — EN/DE translation strings
  pdfshift.ts            — PDF generation via PDFShift API
  plans.ts               — Plan feature gating (free/trial/starter/pro/enterprise)
  rate-limit.ts          — IP-based rate limiting
  session-timeout.ts     — Session expiry logic
  stripe.ts              — Stripe client initialisation
  admin-guard.ts         — Server-side admin role check

/supabase/migrations     — 22 versioned SQL migration files (see Database Schema below)
/__tests__               — Vitest unit tests (manufacturer-terms.test.ts)
```

> **Note:** The CLAUDE.md template references `/lib/pms/` and a `PMSRecord` interface.
> These do NOT exist. Scrapers live in `/lib/scrapers/` and normalise to `ScrapedFsn`
> (defined in `lib/scrapers/bfarm.ts`). All scraper functions return `ScraperResult`
> `{ items: ScrapedFsn[], warnings: string[] }`.

---

## Database Schema

All tables have RLS enabled. Service-role client (`createAdminClient`) bypasses RLS in API routes.

### `users`
Core user record, mirrors `auth.users`. Extended with Stripe billing and GDPR columns.
- `id`, `email`, `full_name`, `company_name`
- `plan` — `'free' | 'trial' | 'starter' | 'pro' | 'enterprise'`
- `role` — `'user' | 'admin'`
- `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`
- `subscription_status` — `'inactive' | 'active' | 'past_due' | 'canceled' | 'trialing'`
- `current_period_end`
- GDPR: `deletion_requested_at`, `deleted_at`, `consent_cookies_at`, `consent_terms_at`, `consent_privacy_at`

### `product_profiles`
One per device the user monitors.
- `id`, `user_id`, `device_name`, `manufacturer`
- `intended_use`, `emdn_code`, `device_class`, `ifu_storage_path`
- `default_dbs` (jsonb), `search_strategy` (jsonb)
- `last_modified_at`, `last_modified_by`

### `search_runs`
One per PMS search execution.
- `id`, `profile_id`, `user_id`
- `status` — `'pending' | 'running' | 'complete' | 'error' | 'degraded' | 'cancelled'`
- `period_from`, `period_to` (date)
- `started_at`, `completed_at`, `error`
- `relevant_count`, `uncertain_count`, `excluded_count`
- Selected databases stored in application layer (not a DB column)

### `fsn_results`
One per FSN returned by a scraper for a given run.
- `id`, `search_run_id` (cascade delete), `external_id`, `title`
- `manufacturer`, `fsn_date`, `source_url`, `raw_content`
- `source` — `'bfarm' | 'mhra' | 'fda' | 'swissmedic'`
- `canonical_id` → `fsn_canonical.id`, `content_hash`
- Legacy: `search_run_id` also appears as a nullable FK with NO ACTION in some
  older rows — must be NULL'd before deleting a `search_run`.

### `filter_decisions`
Append-only AI filter output per FSN result. Never UPDATE or DELETE rows.
- `id`, `fsn_result_id`, `search_run_id`
- `decision` — `'relevant' | 'uncertain' | 'excluded'`
- `rationale`, `confidence` (0–1), `model`

### `reports`
Generated PDF/Excel reports linked to a run.
- `id`, `run_id`, `user_id`
- `pdf_storage_path`, `excel_storage_path`, `generated_at`

### `pdf_usage`
Per-user, per-month PDF quota tracking (free tier: 45 global / 10 per user).
- `id`, `user_id`, `month` (format: `'2026-04'`), `count`
- Service-role only. Has `increment_pdf_usage(user_id, month)` RPC.

### `audit_log`
Immutable security event trail. **Never UPDATE or DELETE rows.**
- `id`, `user_id`, `event_type`, `event_data` (jsonb), `ip_address`, `user_agent`, `created_at`
- Service-role only.

### `login_attempts`
IP-based rate limit tracking.
- `id`, `ip_address`, `email`, `success`, `attempted_at`

### `search_drafts`
Saved but not yet executed search configurations.
- `id`, `user_id`, `profile_id`
- `name`, `search_period_from`, `search_period_to`
- `dbs_selected`, `generic_terms`, `manufacturer_terms`, `uploaded_file_paths` (all jsonb)

### `trial_codes`
Single-use QR codes for DEMA booth promotion.
- `id`, `code` (unique), `batch_name`
- `redeemed_by_email`, `redeemed_by_user_id`, `redeemed_at`
- `created_by`, `created_at`, `expires_at`

### `used_trial_emails`
Prevents a single email from redeeming multiple trial codes.
- `email` (PK), `trial_code_id`, `used_at`

### `profile_edit_history`
Audit trail for edits to `product_profiles`. Append-only.
- `id`, `profile_id`, `edited_by`, `edited_at`
- `changed_fields` (jsonb), `previous_values` (jsonb)

### `filter_decision_cache`
Cache AI filter decisions keyed on (fsn_external_id, profile_fingerprint).
Saves ~80% of AI calls when multiple users have similar device profiles.
- `id`, `fsn_external_id`, `profile_fingerprint`
- `decision`, `rationale`, `confidence` (0–100), `model_used`

### `user_feedback`
In-app star rating + qualitative feedback.
- `id`, `user_id`, `rating` (1–5), `most_useful` (text[]), `missing_features`, `triggered_by`

### `fsn_canonical`
Deduplication store — one row per (source, source_record_id). Stable across runs.
- `id`, `source`, `source_record_id`, `title`, `manufacturer`, `product_name`
- `fsn_date`, `source_url`, `raw_content`, `content_hash`
- `first_seen_at`, `last_seen_at`, `revision_count`

### `sync_coverage`
Tracks which date ranges have already been scraped per source (incremental fetch).
- `id`, `source`, `covered_from`, `covered_to`, `updated_at`

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# AI
ANTHROPIC_API_KEY

# FDA MAUDE (optional — raises daily quota from 1k to 120k req/day)
OPENFDA_API_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Email
RESEND_API_KEY

# PDF (PDFShift external API)
PDFSHIFT_API_KEY

# App URL (for QR codes, absolute email links)
NEXT_PUBLIC_SITE_URL
```

---

## PMS Scraper Architecture

All scrapers are in `/lib/scrapers/`. They all accept `ScraperParams` and return `ScraperResult`.

```typescript
// Defined in lib/scrapers/bfarm.ts
interface ScraperParams {
  fromDate:     string        // YYYY-MM-DD
  toDate:       string        // YYYY-MM-DD
  searchTerms?: string[]      // pre-computed tokens from buildManufacturerSearchTerms
  profile?: { manufacturer: string; device_name: string }
}
interface ScraperResult {
  items:    ScrapedFsn[]
  warnings: string[]   // non-empty → mark run as 'degraded'
}
```

| Scraper | Source | Country | Method |
|---|---|---|---|
| `bfarm.ts` | BfArM Kundeninfos | Germany | HTML scraper (portal pagination) |
| `fda-maude.ts` | FDA MAUDE | USA | openFDA REST API (`api.fda.gov/device/event.json`) |
| `mhra.ts` | MHRA Medical Device Alerts | UK | HTML scraper (GOV.UK portal) |
| `swissmedic.ts` | Swissmedic FSCA | Switzerland | REST API (`fsca.swissmedic.ch/mep/api/`) |

**Manufacturer filtering:** `lib/search/manufacturer-terms.ts` exports `buildManufacturerSearchTerms(manufacturer, deviceName?)` — strips legal suffixes, generic words, and tokens ≤4 chars to produce 1–3 discriminating search tokens. FDA uses these for Lucene query narrowing; Swissmedic uses client-side filtering (server ignores `searchText` param).

**Deduplication / incremental fetch:** `lib/sync/canonical.ts` and `lib/sync/coverage.ts` prevent re-processing known FSNs and skip already-covered date ranges.

---

## AI Filter Pipeline

Located in `lib/claude/filter-pipeline.ts`. Uses `claude-sonnet-4-5` (or current model).
- Classifies each FSN as `relevant | uncertain | excluded` against the device profile
- Results written to `filter_decisions` (append-only) and cached in `filter_decision_cache`
- Rate-limited via `lib/claude/rate-limiter.ts`

---

## Coding Standards (Apply ONLY when asked)

- No `any` types — ever
- Zod validation on ALL API inputs
- Server Components by default — `'use client'` only when necessary
- `cn()` (`clsx` + `tailwind-merge`) for all conditional Tailwind classes
- Supabase server client in Server Components and API routes
- Supabase browser client only in Client Components
- RLS always enabled — never bypass it without service-role client
- Never hardcode secrets — always `process.env`
- Never log patient data to console or external services
- Audit logs (`audit_log`) are immutable — never UPDATE or DELETE rows
- `filter_decisions` is append-only — never UPDATE or DELETE rows

---

## Compliance Context (Check ONLY when asked)

- **POPIA** (South Africa) — primary compliance framework
- **HIPAA** (USA) — secondary, for international patients
- Patient/user data must be encrypted at rest and in transit
- Consent must be recorded before collecting sensitive health data
- Every action on a patient record must produce an `audit_log` entry
- PHI must never be sent raw to external APIs including Anthropic

---

## End-of-session checklist

After completing any feature or fix work, before reporting done:

1. Run `git status` — confirm no untracked or modified files that should have been committed.
2. Run `git log --oneline origin/main..HEAD` — confirm no local-only commits. If any exist, push or flag them explicitly.
3. Never assume work is shipped just because it's committed locally.
