# E2E Repair Plan — Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 issues found during Playwright E2E testing: billing pricing mismatch, AI rationale hallucination, legal placeholders, archive filter gap, imprint link color.

**Architecture:** All 5 fixes are independent — different files, no shared state. Each task produces a self-contained change. The billing fix centralizes plan features into `lib/plans.ts`. The AI fix adds prompt guardrails to `lib/claude/filter-pipeline.ts`. Legal fixes are string replacements. Archive fix adds one dropdown option.

**Tech Stack:** Next.js 16, TypeScript, Anthropic AI SDK, Tailwind CSS

---

### Task 1: Fix billing page PLAN_FEATURES to derive from plans.ts

**Files:**
- Modify: `lib/plans.ts:1-51`
- Modify: `app/dashboard/billing/page.tsx:1-44`

- [ ] **Step 1: Add `features` field to PlanLimits and each plan in `lib/plans.ts`**

In `lib/plans.ts`, add `features: string[]` to the `PlanLimits` interface and populate each plan:

```typescript
export interface PlanLimits {
  maxSearchRuns: number
  maxProfiles: number
  label: string
  priceMonthly: string
  features: string[]
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    label: 'Free',
    priceMonthly: '€0',
    maxSearchRuns: 1,
    maxProfiles: 1,
    features: [
      '1 search run',
      '1 product profile',
      'BfArM database',
      'PDF & Excel reports',
    ],
  },
  trial: {
    label: 'Trial',
    priceMonthly: '€0',
    maxSearchRuns: 1,
    maxProfiles: 1,
    features: [
      '1 free search run',
      '1 product profile',
      'BfArM database',
      'PDF & Excel reports',
    ],
  },
  starter: {
    label: 'Starter',
    priceMonthly: '€199',
    maxSearchRuns: 15,
    maxProfiles: 3,
    features: [
      '3 device profiles',
      '15 searches per month',
      'All P1 databases (BfArM, FDA, MHRA)',
      'PDF & Excel reports',
      'Email notifications',
    ],
  },
  pro: {
    label: 'Pro',
    priceMonthly: '€599',
    maxSearchRuns: 50,
    maxProfiles: 10,
    features: [
      '10 device profiles',
      '50 searches per month',
      'All databases',
      'PDF & Excel reports',
      'Email notifications',
      'Priority support',
    ],
  },
  enterprise: {
    label: 'Enterprise',
    priceMonthly: 'Custom',
    maxSearchRuns: -1,
    maxProfiles: -1,
    features: [
      'Unlimited everything',
      'Custom database integrations',
      'Dedicated account manager',
      'SLA agreement',
      'Custom onboarding',
    ],
  },
}
```

- [ ] **Step 2: Delete PLAN_FEATURES from billing page and use PLANS.features**

In `app/dashboard/billing/page.tsx`, delete the entire `PLAN_FEATURES` constant (lines 9-44). Then replace every reference to `PLAN_FEATURES[currentPlan]` and `PLAN_FEATURES[planId]` with `PLANS[currentPlan].features` and `PLANS[planId].features`.

Line 123 — change:
```typescript
{PLAN_FEATURES[currentPlan].map((f) => (
```
to:
```typescript
{PLANS[currentPlan].features.map((f) => (
```

Line 165 — change:
```typescript
{PLAN_FEATURES[planId].map((f) => (
```
to:
```typescript
{PLANS[planId].features.map((f) => (
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:3000/dashboard/billing`. Confirm:
- Starter card shows "3 device profiles" and "15 searches per month"
- Pro card shows "10 device profiles" and "50 searches per month"

- [ ] **Step 5: Commit**

```bash
git add lib/plans.ts app/dashboard/billing/page.tsx
git commit -m "fix(billing): derive plan features from plans.ts source of truth

Billing page had a hardcoded PLAN_FEATURES map that drifted from
plans.ts — Starter showed 'Unlimited/1 profile' instead of '15 searches/3 profiles'.

Co-Authored-By: Neuridion"
```

---

### Task 2: Fix AI filter pipeline — prevent manufacturer mismatch hallucination

**Files:**
- Modify: `lib/claude/filter-pipeline.ts:75-148` (system prompt)
- Modify: `lib/claude/filter-pipeline.ts:258-295` (Haiku prompt)
- Modify: `lib/claude/filter-pipeline.ts:326-339` (Sonnet tool schema)

- [ ] **Step 1: Add RATIONALE RULES section to SYSTEM_PROMPT**

In `lib/claude/filter-pipeline.ts`, in the `SYSTEM_PROMPT` string, insert the following block after the EDGE CASES section (after line 121, before EXAMPLES on line 123):

```
RATIONALE RULES

NEVER claim "manufacturer mismatch" unless the FSN manufacturer and profile manufacturer are genuinely different corporate entities. Different legal name forms of the same company (e.g. "B. Braun" vs "B. Braun Melsungen AG", "Medtronic" vs "Medtronic Ireland") are the SAME manufacturer. When excluding an FSN, you MUST identify which specific exclusion criterion applies and cite concrete evidence from both the FSN and the device profile. Begin every rationale by stating: "FSN manufacturer: [name]. Profile manufacturer: [name]."

```

- [ ] **Step 2: Update the `record_decision` tool schema rationale description**

In `lib/claude/filter-pipeline.ts`, at line 334, change:

```typescript
rationale:  { type: 'string' },
```

to:

```typescript
rationale:  {
  type: 'string',
  description:
    'Explain your decision. You MUST begin by stating: "FSN manufacturer: [X]. Profile manufacturer: [Y]." ' +
    'Then explain whether these are the same entity and whether the device type/technology overlaps.',
},
```

- [ ] **Step 3: Tighten Haiku pre-filter prompt to include manufacturer comparison**

In `lib/claude/filter-pipeline.ts`, at lines 274-279, change the user content string from:

```typescript
`Device profile: ${profile.device_name} by ${profile.manufacturer}` +
(profile.device_class ? `, ${profile.device_class}` : '') +
`\n\n<FSN_DATA>\nFSN: "${sanitizeContent(sanitizePii(fsn.title), 500)}" by ${sanitizeContent(sanitizePii(fsn.manufacturer || 'Unknown'), 200)}\n</FSN_DATA>\n\n` +
'Is this FSN CLEARLY NOT relevant to the device profile? ' +
'Only say CLEAR_EXCLUDE if the device type or clinical domain is ' +
'obviously different. Otherwise say UNCERTAIN.',
```

to:

```typescript
`Device profile: ${profile.device_name} by ${profile.manufacturer}` +
(profile.device_class ? `, ${profile.device_class}` : '') +
`\nFSN manufacturer: ${sanitizeContent(sanitizePii(fsn.manufacturer || 'Unknown'), 200)}` +
`\n\n<FSN_DATA>\nFSN: "${sanitizeContent(sanitizePii(fsn.title), 500)}"\n</FSN_DATA>\n\n` +
'Is this FSN CLEARLY NOT relevant to the device profile? ' +
'Only say CLEAR_EXCLUDE if BOTH the device type/clinical domain AND the manufacturer ' +
'are clearly unrelated. If the manufacturers are the same company (even under different legal names), say UNCERTAIN.',
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/claude/filter-pipeline.ts
git commit -m "fix(ai): add prompt guardrails to prevent manufacturer mismatch hallucination

Sonnet could claim 'manufacturer mismatch' for same-manufacturer FSNs
when the legal name form differed (e.g. 'B. Braun' vs 'B. Braun Melsungen AG').
Added RATIONALE RULES to system prompt, structured rationale requirement
in tool schema, and tightened Haiku pre-filter to compare manufacturers
explicitly.

Co-Authored-By: Neuridion"
```

---

### Task 3: Replace legal page placeholders with Neuridion / [TO BE ADDED]

**Files:**
- Modify: `app/imprint/page.tsx:29-91`
- Modify: `app/privacy/page.tsx:26-27,245-251`
- Modify: `app/terms/page.tsx:67,101`

- [ ] **Step 1: Fix imprint page — replace all 10 placeholders**

In `app/imprint/page.tsx`, make these replacements:

| Line | Old | New |
|---|---|---|
| 29 | `[COMPANY LEGAL NAME — REQUIRED]` | `Neuridion` |
| 33 | `[e.g. GmbH, UG — REQUIRED]` | `[TO BE ADDED]` |
| 37 | `[STREET + NUMBER — REQUIRED]` | `[TO BE ADDED]` |
| 41 | `[POSTCODE CITY — REQUIRED]` | `[TO BE ADDED]` |
| 55 | `[EMAIL — REQUIRED]` | `info@neuridion.eu` |
| 59 | `[PHONE — REQUIRED (§5 TMG)]` | `[TO BE ADDED]` |
| 69 | `[FULL NAME — REQUIRED]` | `[TO BE ADDED]` |
| 79 | `[REGISTER COURT + NUMBER — REQUIRED]` | `[TO BE ADDED]` |
| 83 | `[DE + 9 DIGITS — REQUIRED]` | `[TO BE ADDED]` |
| 91 | `[FULL NAME + ADDRESS — REQUIRED]` | `[TO BE ADDED]` |

Also remove `text-red-600 font-medium` class from each `<span>` that contained a placeholder (lines 29, 33, 37, 41, 55, 59, 69, 79, 83, 91) — replace with `text-amber-600 font-medium` for the `[TO BE ADDED]` items to visually distinguish them. The `info@neuridion.eu` span should use normal body text styling (remove the red class entirely, use `text-[#1E293B]`).

- [ ] **Step 2: Fix privacy page — replace all 4 placeholders**

In `app/privacy/page.tsx`:

Line 26 — change:
```
<strong>[COMPANY LEGAL NAME] — PLACEHOLDER</strong>
```
to:
```
<strong>Neuridion</strong>
```

Line 27 — change:
```
<strong>[COMPANY ADDRESS] — PLACEHOLDER</strong>
```
to:
```
<strong>[TO BE ADDED]</strong>
```

Line 245 — change:
```
<strong>[COMPANY LEGAL NAME] — PLACEHOLDER</strong>
```
to:
```
<strong>Neuridion</strong>
```

Line 251 — change:
```
<strong>[ADDRESS — PLACEHOLDER]</strong>
```
to:
```
<strong>[TO BE ADDED]</strong>
```

- [ ] **Step 3: Fix terms page — replace 2 placeholders**

In `app/terms/page.tsx`:

Line 67 — change:
```
<strong>[COMPANY LEGAL NAME] — PLACEHOLDER</strong>
```
to:
```
<strong>Neuridion</strong>
```

Line 101 — change:
```
<strong>[CITY — PLACEHOLDER]</strong>
```
to:
```
<strong>[TO BE ADDED]</strong>
```

- [ ] **Step 4: Verify no remaining PLACEHOLDER text**

Run: `grep -rn "PLACEHOLDER\|REQUIRED\]" app/privacy/ app/terms/ app/imprint/ 2>/dev/null`
Expected: No output (all placeholders replaced).

Run: `grep -rn "TO BE ADDED" app/privacy/ app/terms/ app/imprint/ 2>/dev/null`
Expected: Shows the remaining items that need real company data before launch.

- [ ] **Step 5: Commit**

```bash
git add app/imprint/page.tsx app/privacy/page.tsx app/terms/page.tsx
git commit -m "fix(legal): replace 16 placeholder instances with Neuridion / [TO BE ADDED]

Imprint (10), Privacy (4), and Terms (2) had placeholder text.
Company name set to Neuridion, email to info@neuridion.eu.
Remaining fields marked [TO BE ADDED] for pre-launch legal review.

Co-Authored-By: Neuridion"
```

---

### Task 4: Add 'degraded' to archive status filter dropdown

**Files:**
- Modify: `app/dashboard/archive/archive-table.tsx:161-165`

- [ ] **Step 1: Add degraded option to status filter**

In `app/dashboard/archive/archive-table.tsx`, at line 165, add a new option before the closing `</select>` tag. Change lines 161-166 from:

```tsx
<option value="all">All statuses</option>
<option value="complete">Completed</option>
<option value="running">Running</option>
<option value="error">Failed</option>
<option value="cancelled">Cancelled</option>
```

to:

```tsx
<option value="all">All statuses</option>
<option value="complete">Completed</option>
<option value="degraded">Partial results</option>
<option value="running">Running</option>
<option value="error">Failed</option>
<option value="cancelled">Cancelled</option>
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/dashboard/archive`. Open the status dropdown and confirm "Partial results" appears. Select it and confirm only degraded runs show.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/archive/archive-table.tsx
git commit -m "fix(archive): add 'Partial results' option to status filter dropdown

Users could not filter for degraded runs in the archive table.

Co-Authored-By: Neuridion"
```

---

### Task 5: Fix imprint page footer link color

**Files:**
- Modify: `app/imprint/page.tsx:103,115-117`

- [ ] **Step 1: Replace blue-600 with brand teal on all 4 links**

In `app/imprint/page.tsx`, replace all 4 instances of `text-blue-600 hover:underline` with `text-[#0D9488] hover:underline`:

Line 103:
```tsx
className="text-blue-600 hover:underline"
```
to:
```tsx
className="text-[#0D9488] hover:underline"
```

Lines 115-117 (3 footer links):
```tsx
<Link href="/"        className="text-blue-600 hover:underline">← Home</Link>
<Link href="/privacy" className="text-blue-600 hover:underline">Privacy</Link>
<Link href="/terms"   className="text-blue-600 hover:underline">Terms</Link>
```
to:
```tsx
<Link href="/"        className="text-[#0D9488] hover:underline">← Home</Link>
<Link href="/privacy" className="text-[#0D9488] hover:underline">Privacy</Link>
<Link href="/terms"   className="text-[#0D9488] hover:underline">Terms</Link>
```

- [ ] **Step 2: Commit (bundle with Task 3 legal commit, or separate)**

If Task 3 is not yet committed, include this in the same commit. Otherwise:

```bash
git add app/imprint/page.tsx
git commit -m "fix(imprint): use brand teal for footer links instead of blue-600

All other legal pages use text-[#0D9488]. Imprint was the outlier.

Co-Authored-By: Neuridion"
```

---

### Final: TypeScript + verification pass

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 2: Verify grep for remaining issues**

Run: `grep -rn "PLAN_FEATURES" app/dashboard/billing/ 2>/dev/null`
Expected: No output (constant deleted).

Run: `grep -rn "PLACEHOLDER\|REQUIRED\]" app/privacy/ app/terms/ app/imprint/ 2>/dev/null`
Expected: No output.

Run: `grep -rn "blue-600" app/imprint/ 2>/dev/null`
Expected: No output.
