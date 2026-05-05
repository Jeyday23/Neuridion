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

## Backlog (Open)
- [ ] MHRA attachment-aware hashing (content_hash misses PDF updates)
- [ ] FDA MAUDE bulk-download ingestion (bypass 26k record API cap)
- [ ] Incremental sync — scheduled background job
- [ ] Incremental sync — CLI for manual backfill
