# Neuridion — v4 Milestone Progress

Track milestones here. Mark `- [x]` when done, `- [ ]` when open.
The dashboard at http://127.0.0.1:4747 reads this file every 2 seconds.

---

## Core Platform
- [x] Project setup (Next.js 16, TypeScript, Tailwind, Supabase)
- [x] Authentication & session management (Supabase Auth)
- [x] User settings & account management
- [x] GDPR: data export and account deletion
- [x] Cookie consent & audit logging

## Regulatory Scrapers
- [x] BfArM scraper (Germany — HTML portal)
- [x] FDA MAUDE scraper (USA — openFDA REST API)
- [x] MHRA scraper (UK — GOV.UK portal)
- [x] Swissmedic scraper (Switzerland — FSCA REST API)
- [x] Manufacturer term extraction & filtering
- [x] Canonical deduplication store (fsn_canonical)
- [x] Incremental coverage tracking (sync_coverage)

## AI Pipeline
- [x] Claude AI filter pipeline (relevant / uncertain / excluded)
- [x] Rate limiter for AI calls
- [x] Filter decision cache (~80% AI cost reduction)

## Search & Results
- [x] Search runs (start, cancel, status polling)
- [x] Results view with per-source breakdown
- [x] Archive of past search runs
- [x] Search drafts (save/load configuration)

## Reports & Export
- [x] PDF report generation (PDFShift)
- [x] Excel export (ExcelJS)
- [x] PDF quota tracking per user/month
- [x] Word (.docx) export (docx package, plan-gated Starter+)

## Billing & Plans
- [x] Stripe integration (checkout + portal)
- [x] Plan feature gating (free / trial / starter / pro / enterprise)
- [x] Stripe webhook handler

## Admin Panel
- [x] Admin dashboard (users, feedback, QR codes, runs)
- [x] Trial codes for DEMA booth
- [x] QR code generation

## Product Polish
- [x] Rebrand: Kodex Medical → Neuridion
- [x] Neuridion design system (DESIGN.md)
- [x] Security audit & hardening (SECURITY_AUDIT.md)
- [x] Internationalisation: EN / DE (i18n.ts)
- [x] React-PDF migration (Playwright → @react-pdf/renderer)
- [x] p-limit concurrency for AI filter loop
- [x] Append-only enforcement on filter_decisions (DB rules)
- [x] DELETE RLS policy on search_runs
- [x] Archive table UX: status labels, DB names, date formatting
- [x] Remove dead Stripe webhook route
- [x] Zod validation on profiles + search-drafts API
- [x] Remove misleading "Create Profile" button
- [x] Version pinning: critical deps pinned, .npmrc save-exact=true
- [x] npm audit fix (Next.js 16.2.6)

## Security & Compliance
- [x] Self-approval soft enforcement with audit trail (EU MDR Annex IX 4.5.5)
- [x] Contact form with anti-spam (honeypot + timing + rate limit)
- [x] Accessibility statement (BFSG/EAA, WCAG 2.1 AA target)
- [x] Widerrufsbelehrung (14-day withdrawal, EU Directive 2011/83/EU)
- [x] Cookie inventory in privacy policy (5 cookies documented)
- [x] DPO disclosure (Art. 37 GDPR)
- [x] Art. 22 GDPR automated decision-making cross-reference
- [x] EU AI Act risk classification (minimal risk)
- [x] VAT labels on pricing (zzgl. MwSt.)
- [x] Footer: Withdrawal, DPA, AI Transparency, Accessibility, Manage cookies
- [x] Credential rotation (Supabase + Anthropic API keys)
- [x] .claude/settings.json untracked from git

## UX Overhaul
- [x] Skeleton loaders (Skeleton component + 8 loading.tsx files)
- [x] Global toast notification system (Toast + ToastProvider)
- [x] Error message cleanup (toast in settings, archive, billing; friendly login messages)
- [x] Rate limit feedback (user-facing 429 toast across search, archive, billing)
- [x] Feature discovery tooltips (Radix Tooltip — databases, terms, EMDN, intended use)
- [x] Quota visibility in dashboard sidebar (QuotaBar with plan limits)
- [x] Replace Loader2 spinners (inline toast removed, edit-form/widget cleaned up)
- [ ] Server-side caching (unstable_cache + revalidateTag — deferred, needs API verification)
- [ ] Optimistic rendering (useOptimistic + Server Actions — deferred, needs Server Action conversion)

## OWASP Security Hardening (May 13)
- [x] IDOR fix: cancel route filters by user_id in query
- [x] LLM prompt injection: sanitizeContent() on all FSN fields before AI
- [x] FSN_DATA boundary escape neutralization in sanitizeContent()
- [x] BfArM stored XSS: sanitize detail enrichment before DB write
- [x] CSP: confirmed enforcing nonce-based CSP via proxy.ts
- [x] Stripe webhook: audit logging + TTL idempotency guard
- [x] OTP null safety: optional chain replaces unsafe assertion
- [x] Billing error handling: try/catch on Stripe checkout/portal
- [x] Shannon entropy: profile fingerprint 128-bit, trial codes 59-bit, HMAC session cookie
- [x] Scraping funnel metrics: total_scraped + pre_filter_count in archive + search panel
- [x] AI cost estimate: live € range shown before Run Search
- [x] Preview Items: free scrape-only item count (no AI cost)

## Pipeline Decomposition (May 14)
- [x] Shared types: lib/pipeline/types.ts (PipelineContext, stage contracts)
- [x] Stage: stages/scrape.ts — scraper fan-out, dedup, canonical upsert
- [x] Stage: stages/insert-results.ts — fsn_results row insertion
- [x] Stage: stages/filter.ts — cache, pre-filter, AI filter, BfArM enrichment
- [x] Stage: stages/persist-decisions.ts — filter_decisions batch insert
- [x] Stage: stages/finalize.ts — counts, status, audit log, email (TDD)
- [x] Orchestrator: run-search.ts rewritten (549 → 102 lines)
- [x] Stage-level error isolation with degraded status propagation
- [x] Zero behavior changes to process-job/route.ts caller

## Council Recommendations (May 14)
- [x] #1 Pipeline decomposition (above)
- [x] #2 Regenerate Supabase types + remove all `as any` casts
- [x] #3 Audit dependencies: removed Three.js ecosystem (1,034 lines, 15 packages)
- [x] #4 API route tests: 44 new tests (profiles, search-runs, search-runs/[id])
- [x] #5 Consolidate CSP: extracted to lib/security/csp.ts with 5 unit tests

## Security Audit & Repair (May 14)
- [x] 5-agent security swarm: OWASP, Shannon, Auth, Injection, PII
- [x] P0: HMAC timing attack fix (safeCompare in proxy.ts)
- [x] P0: HMAC tag extended from 64-bit to 128-bit
- [x] P0: Error logging sanitized at 12 sites (no stack trace leaks)
- [x] P0: select('*') replaced with explicit columns in GDPR data export
- [x] P1: Derived purpose-specific HMAC key (key separation)
- [x] P1: Math.random() → crypto.randomUUID() in FDA scraper
- [x] P1: Logout cookie: HttpOnly, Secure, SameSite attributes
- [x] P1: Profiles + search-runs APIs: explicit column selection
- [x] P1: Claim route: [code] path param validation
- [x] P1: Feedback: bounded most_useful array (20 items, 200 chars)
- [x] P1: Stripe webhook: fixed misleading 'as id' type cast
- [x] P2: AI prompt injection tagging on device names
- [x] P2: selected_dbs enum validation (already done via Zod z.enum)
- [ ] P2: CSP header application via middleware (buildCspHeader exists but not wired)
- [x] P2: Audit log on retry route (fixed wrong event type: cancelled → retried)
- [x] P2: Rate limiter cold-start bypass (fail-closed in production without Redis)

## OWASP Hardening (May 17)
- [x] P1: Centralized auth middleware (middleware.ts — defense-in-depth)
- [x] P1: LLM prompt injection fix (sanitizeProfileField + tag stripping)
- [x] P1: Server-side 8-hour absolute session timeout enforcement
- [x] P2: Meta CSP on HTML reports (prevent script execution in Storage domain)
- [x] P2: login_failed audit event for OTP verification failures
- [x] P3: safeCompare HMAC-based length-leak fix (both utils/auth + crypto-utils)
- [x] P3: Rate limit on search-drafts GET handler

## PRRC Council Root-Cause Fixes (May 17)
- [x] Domain language: "classified" → "assessed" across all surfaces
- [x] Domain language: "MDR report" → "Adverse event report" for FDA MAUDE
- [x] Domain language: "Not Reviewed" → "Unprocessed" for unfiltered items
- [x] Domain language: raw model names hidden, replaced with "AI-assisted"
- [x] Manufacturer field added to hero FSN cards and FsnExamples component
- [x] Confidence tooltip added to FSN example cards
- [x] Signup: emailRedirectTo wired to /login for email confirmation flow
- [x] dbs_searched column populated on search run creation (was always null)
- [x] Fixed dbs_selected → dbs_searched column name in reports query
- [x] Review gate: report generation blocked until PRRC review is complete (422)
- [x] Review gate: report download blocked until PRRC review is complete (422)
- [x] GenerateReportButton surfaces API error messages (review-required, etc.)
- [x] Audit log retention aligned to 10 years (MDR Art. 10(8)), was 5 years
- [x] Privacy policy: removed false AI opt-out toggle promise, replaced with email contact

## Backlog (Open)
- [ ] MHRA attachment-aware hashing (content_hash misses PDF updates)
- [ ] FDA MAUDE bulk-download ingestion (bypass 26k record API cap)
- [ ] Incremental sync — scheduled background job
- [ ] Incremental sync — CLI for manual backfill
- [ ] Impressum placeholders — need real company data
- [ ] DPA document — needs downloadable template
