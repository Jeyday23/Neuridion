# E2E Test Repair Plan — Design Spec

**Date:** 2026-05-14
**Author:** Council (4-agent analysis) + Claude
**Trigger:** Playwright E2E walkthrough uncovered 5 issues across pricing, AI classification, legal content, and archive UX.

---

## Issue 1 (P2): Billing Page Pricing Mismatch

### Problem
`app/dashboard/billing/page.tsx` lines 8-44 define a hardcoded `PLAN_FEATURES` map that disagrees with the canonical `lib/plans.ts` source of truth.

| Feature | plans.ts (correct) | Billing page (wrong) |
|---|---|---|
| Starter profiles | 3 | 1 |
| Starter searches | 15/month | Unlimited |
| Pro profiles | 10 | 5 |
| Pro searches | 50/month | Unlimited |

### Root Cause
`PLAN_FEATURES` was written once and never synced when `plans.ts` limits changed.

### Fix
1. Extend `PlanLimits` in `lib/plans.ts` to include a `features: string[]` array per plan.
2. Delete the `PLAN_FEATURES` constant from `billing/page.tsx`.
3. Read features from `PLANS[planId].features` everywhere the billing page currently reads `PLAN_FEATURES[planId]`.

This ensures a single source of truth. The landing page (`app/page.tsx`) and pricing page (`app/pricing/page.tsx`) also hardcode features but with correct values; they should be migrated to `PLANS` in a follow-up, not this repair batch.

### Files Changed
- `lib/plans.ts` — add `features` field to each plan
- `app/dashboard/billing/page.tsx` — delete `PLAN_FEATURES`, use `PLANS[planId].features`

### Verification
- TypeScript check passes
- Navigate to `/dashboard/billing` and confirm Starter shows "3 product profiles, 15 searches/month" and Pro shows "10 product profiles, 50 searches/month"

---

## Issue 2 (P3): AI Classification Rationale Hallucination

### Problem
An FSN from B. Braun Melsungen AG was excluded with rationale "Manufacturer mismatch" despite the profile manufacturer being B. Braun. The exclusion decision may be correct (different device: Perfusor vs Infusomat), but the stated reason is factually wrong.

### Root Cause
Sonnet's system prompt has no instruction requiring the model to verify manufacturer fields match before claiming "manufacturer mismatch." The rationale field has no structural constraint. This is systemic — any same-manufacturer, different-product FSN is vulnerable.

### Fix (3 changes in `lib/claude/filter-pipeline.ts`)

**A. Structured rationale in tool schema (~line 330-337):**
Update the `rationale` property description in the `record_decision` tool to require the model to explicitly state both manufacturer names:

> "You MUST begin the rationale by stating: 'FSN manufacturer: [X]. Profile manufacturer: [Y].' Then explain whether these match, and whether the device type/technology overlaps."

**B. Anti-hallucination guardrail in system prompt (~after line 122):**
Add a RATIONALE RULES section:

> NEVER claim "manufacturer mismatch" unless the FSN manufacturer and profile manufacturer are genuinely different entities -- not just different legal name forms (e.g., "B. Braun" vs "B. Braun Melsungen AG" are the SAME manufacturer). When excluding, cite which exclusion criterion applies with specific evidence from both the FSN and the profile.

**C. Pass manufacturer explicitly in Haiku prompt (~line 274):**
Change the user message to include both manufacturers side-by-side and tighten the CLEAR_EXCLUDE instruction:

> "Only say CLEAR_EXCLUDE if BOTH the device type/clinical domain AND the manufacturer are clearly unrelated."

### Not Included (deferred)
Fix 4 from the AI analyst (post-hoc programmatic override when manufacturers share tokens) is deferred. It adds runtime complexity and the prompt fixes should address the root cause. Can revisit if the issue recurs.

### Files Changed
- `lib/claude/filter-pipeline.ts`

### Verification
- TypeScript check passes
- No unit test changes needed (rationale is AI-generated text)
- Manual verification: re-run a search against a B. Braun profile and confirm same-manufacturer FSNs no longer get "manufacturer mismatch" rationales

---

## Issue 3 (P2): Legal Page Placeholders — 16 Instances

### Problem
3 legal pages contain placeholder text that must be filled before launch. The Imprint page is a German legal blocker under SS5 TMG.

### Inventory

**`app/imprint/page.tsx`** (10 placeholders):
- Company legal name, legal form, street address, city/postcode
- Email, phone
- Managing director name
- Trade register court + number, VAT ID
- Responsible person for content

**`app/privacy/page.tsx`** (4 placeholders):
- Company legal name (x2), company address (x2)

**`app/terms/page.tsx`** (2 placeholders):
- Company legal name (x1), city for jurisdiction (x1)

### Fix
Replace all 16 placeholders with "Neuridion" as company name and "[TO BE ADDED]" for specific details (address, VAT, register, phone, managing director). This makes them easy to grep and fill when the legal entity is finalized.

Also fix: Imprint page footer links use `text-blue-600` instead of `text-[#0D9488]` (brand teal used on all other legal pages).

### Files Changed
- `app/imprint/page.tsx`
- `app/privacy/page.tsx`
- `app/terms/page.tsx`

### Verification
- Navigate to each page and confirm no `[COMPANY` or `PLACEHOLDER` text visible
- Grep for `TO BE ADDED` to confirm all remaining items are marked consistently

---

## Issue 4 (P4): Archive Status Filter Missing "degraded"

### Problem
The archive table status filter dropdown does not include `degraded` as an option. Users cannot filter for "Partial results" runs.

### Root Cause
The filter options list at `app/dashboard/archive/archive-table.tsx` (~line 160-164) omits `degraded`.

### Fix
Add `{ value: 'degraded', label: 'Partial results' }` to the status filter options array.

### Files Changed
- `app/dashboard/archive/archive-table.tsx`

### Verification
- Navigate to `/dashboard/archive`, open status filter dropdown, confirm "Partial results" appears
- Select it and confirm only degraded runs are shown

---

## Out of Scope

- **AI Transparency model names:** Confirmed correct (Claude Haiku 4.5 / Claude Sonnet 4.6 match the actual model IDs).
- **"Free plan but unlimited" sidebar:** The sidebar correctly reads the DB `plan` column. The account likely has `plan = 'enterprise'` in the database. No code fix needed.
- **DRAFT banners on legal pages:** Appropriate for prototype phase. Remove before public launch.
- **Landing/pricing page feature lists:** Currently correct but hardcoded. Migrate to `PLANS.features` in a follow-up.
- **Post-hoc AI manufacturer check:** Deferred pending prompt fix effectiveness.
