# Council Audit Report -- 2026-05-16

> **Read-only audit.** This report was produced on 2026-05-16 by 5 parallel audit agents
> (backend, OWASP, Shannon). All findings are recommendations only. No fixes have been
> implemented. Every item is marked **Pending council review** and requires explicit
> approval before any code changes are made.

---

## Summary

| Severity | Count |
|----------|-------|
| P0 Critical | 0 |
| P1 High | 4 |
| P2 Medium | 10 |
| P3 Low | 2 |
| **Total** | **16** |

---

## P0 Critical

No P0 findings in this audit cycle.

---

## P1 High

### DB Connections

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 9 | `lib/supabase/admin.ts` | -- | `createAdminClient()` creates a new Supabase client on every call. A single search run instantiates 7+ clients, exhausting connection budget under concurrency. | Promote to a module-level singleton (lazy-initialized, cached after first call). | Pending council review |

### Storage Orphans

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 10 | `app/api/search-runs/[id]/route.ts` | -- | DELETE handler removes the `search_runs` row but does not clean up associated files in the `reports` storage bucket, leaving orphaned blobs. | After cascade delete, list and remove all objects in `reports/{run_id}/` before returning. | Pending council review |
| 11 | `app/api/profiles/[id]/route.ts` | -- | DELETE handler removes the profile row but does not clean up uploaded IFU documents in the `ifu-documents` bucket. | Remove `ifu-documents/{profile_id}/` contents before or after row deletion. | Pending council review |
| 12 | `app/api/account/delete/route.ts` | -- | GDPR account deletion cleans some storage but misses the `ifu-documents` and `search-attachments` buckets, leaving personal data behind after deletion. | Enumerate and purge objects in `ifu-documents/` and `search-attachments/` scoped to the user before marking deletion complete. | Pending council review |

---

## P2 Medium

### Over-fetching

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 1 | `app/api/reports/route.ts` | 443 | `select('*')` on `search_runs` when only a handful of columns are needed for report generation. Transfers unnecessary data over the wire. | Replace with explicit column list: `select('id, profile_id, status, period_from, period_to')` (or whichever columns are actually used). | Pending council review |
| 2 | `app/admin/page.tsx` | 17-20, 44 | `select('*')` used in count-only queries on multiple tables. The `trial_codes` query is also unbounded with no limit or pagination. | Use `select('id', { count: 'exact', head: true })` for counts. Add `.limit()` to the trial_codes query. | Pending council review |
| 3 | `app/admin/feedback/page.tsx` | 12 | `select('*')` on `user_feedback` fetches all columns including potentially large text fields when only summary data is displayed. | Select only the columns rendered in the admin feedback table. | Pending council review |
| 4 | `app/admin/bugs/page.tsx` | 36 | `select('*')` on `bug_reports` pulls every column for the list view. | Select only the columns needed for the bug list display. | Pending council review |

### Unbounded Queries

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 5 | `app/api/admin/trial-codes/route.ts` | 90 | Query returns all trial codes with no `.limit()` or pagination. Will degrade as the table grows. | Add `.range(offset, offset + pageSize)` pagination or at minimum a `.limit(200)` safety cap. | Pending council review |
| 6 | `app/admin/users/page.tsx` | 19 | Unbounded users list with no pagination. Every user row is fetched and rendered on a single page. | Implement server-side pagination with `.range()` and a page-size cap. | Pending council review |

### N+1 Queries

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 7 | `lib/pipeline/stages/filter.ts` | 160 | Individual UPDATE per BfArM row inside a loop (N+1 pattern). For a run returning 200 BfArM results this issues 200 separate round-trips. | Batch updates using `.upsert()` with an array or a single RPC call that accepts an array of IDs + values. | Pending council review |
| 8 | `lib/pipeline/stages/scrape.ts` | 92-131 | Sequential coverage-merge RPC calls (one per source per date chunk) instead of a single batch operation. | Collect all coverage records and issue a single batch RPC or use a PostgreSQL function that accepts an array of ranges. | Pending council review |

### Missing Audit Logging

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 13 | `app/api/billing/checkout/route.ts` | -- | No `logAuditEvent` call for billing events (checkout session creation, plan changes). Billing actions are invisible in the audit trail. | Add `logAuditEvent(userId, 'billing.checkout_created', { priceId, plan })` after successful Stripe session creation. | Pending council review |
| 14 | `app/api/search-drafts/route.ts` | -- | No `logAuditEvent` call for draft save/load/delete operations. Draft lifecycle is untracked. | Add audit events for `draft.created`, `draft.updated`, and `draft.deleted` actions. | Pending council review |

---

## P3 Low

### Security -- OWASP

| # | File | Line | Finding | Recommended Fix | Status |
|---|------|------|---------|-----------------|--------|
| 15 | `lib/security/csp.ts` | 5 | `style-src 'unsafe-inline'` weakens Content Security Policy. Inline styles can be exploited for CSS-based data exfiltration or UI redressing. | Migrate to nonce-based inline styles. Generate a per-request nonce, pass it to the CSP header, and apply it to any inline `<style>` tags. | Pending council review |
| 16 | `proxy.ts` | 223 | CSP header is only set in production (`NODE_ENV === 'production'`). Development builds have no CSP protection, which means CSP-related bugs are invisible until deployment. | Apply CSP in all environments. Use a relaxed policy for dev (e.g., allow `eval` for HMR) but still enforce the core directives. | Pending council review |

---

## Category Cross-Reference

| Category | Finding IDs | Severity Range |
|----------|-------------|----------------|
| Over-fetching | 1, 2, 3, 4 | P2 |
| Unbounded Queries | 5, 6 | P2 |
| N+1 Queries | 7, 8 | P2 |
| DB Connections | 9 | P1 |
| Storage Orphans | 10, 11, 12 | P1 |
| Missing Audit Logging | 13, 14 | P2 |
| Security (OWASP) | 15, 16 | P3 |
| Security (Shannon) | -- | No findings this cycle |
| Background Jobs | -- | No findings this cycle |

---

## Next Steps

1. Council reviews each finding and votes accept/defer/reject.
2. Accepted P1 items are scheduled for the next sprint.
3. Accepted P2 items are batched into a single hardening PR.
4. P3 items are added to the backlog for opportunistic resolution.
5. No code changes until council approval is recorded.
