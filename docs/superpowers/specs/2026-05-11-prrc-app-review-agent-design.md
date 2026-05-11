# PRRC App Review Agent — Design Spec

**Date:** 2026-05-11
**Status:** Draft
**Owner:** Jeremiah

## Purpose

An AI-powered quality assurance agent that performs a full walkthrough of the Neuridion web app against a local dev server, evaluates every feature, and generates a structured report with pass/fail results, UX observations, and prioritized improvement suggestions.

## Architecture

### Components

1. **Test runner script** (`scripts/prrc-review.ts`) — orchestrates the review
2. **Playwright browser automation** — navigates the app, interacts with UI, captures screenshots
3. **Evaluation logic** — checks each step against expected behavior
4. **Report generator** — compiles findings into a Markdown report

### Dependencies

- `playwright` (dev dependency) — headless browser automation
- `tsx` — runs the TypeScript script directly
- Local dev server (`next dev` on port 3000)
- Test account credentials (from `.env.local` or passed as args)

## Test Sections

### 1. Public Pages
- Landing page loads, hero content visible, CTA buttons work
- Pricing page renders all plan tiers
- Privacy, Terms, DPA, Imprint pages load with correct content
- Footer links work, contact email is `info@neuridion.eu`
- Cookie banner appears, consent can be accepted/declined

### 2. Authentication
- Login page renders OTP form
- OTP can be sent to a test email
- Invalid OTP shows error
- Successful login redirects to dashboard
- Logout works and redirects to landing

### 3. Dashboard Layout
- Sidebar navigation renders all links (Search, Profiles, Archive, Billing, Settings)
- Active page is highlighted in sidebar
- Language selector is visible
- Admin link visible only for admin users

### 4. Profiles
- Profile list page loads
- "New Profile" form renders with all required fields
- Create profile with valid data succeeds
- Edit existing profile works
- Delete profile shows confirmation, deletes on confirm
- Empty state shows when no profiles exist

### 5. Search
- Search panel renders with profile selector, DB checkboxes, date pickers
- All 4 databases shown (BfArM, FDA MAUDE, MHRA, Swissmedic)
- Run search triggers polling, progress indicators appear
- Search completes with results displayed
- Filter tabs work (All, Relevant, Uncertain, Excluded)
- Each result card expands to show rationale

### 6. Report Generation
- "Generate Report" button appears after search completes
- Clicking it triggers report generation (loading state visible)
- PDF, HTML, Excel download links appear after generation
- Downloads produce valid files (non-zero byte)

### 7. Archive
- Archive table shows all past runs
- Columns: Date, Profile, Period, DBs, Status, Results, Report, Actions
- "View Results" links to detail page
- "Delete" shows confirmation and removes the row
- Download buttons produce valid files
- Filters (profile, status) work

### 8. Settings
- Password change form renders with current/new/confirm fields
- Client-side validation shows errors for weak passwords
- GDPR export button triggers data export
- Account deletion flow shows confirmation phrase input

### 9. Billing
- Billing page shows current plan
- Upgrade CTA links to Stripe checkout (verify redirect, don't complete purchase)
- Enterprise tier shows "Contact sales" with correct mailto link

### 10. Admin Panel (if admin account)
- Admin overview page loads
- User management table renders
- Trial code generation form works
- Feedback list renders submitted feedback

### 11. Error Handling & Edge Cases
- 404 page renders for invalid routes
- Rate-limited endpoints return 429 with Retry-After header
- Session timeout behavior (if testable)
- Empty states display correctly

## Report Output

The agent generates `docs/prrc-review/PRRC-QA-Report-YYYY-MM-DD.md` containing:

```markdown
# PRRC Quality Assurance Report
**Date:** YYYY-MM-DD
**Environment:** Local dev (localhost:3000)
**App Version:** [git commit hash]

## Executive Summary
[2-3 sentences: overall health, critical issues count, top recommendation]

## Results Matrix

| # | Section | Tests | Pass | Fail | Skip | Score |
|---|---------|-------|------|------|------|-------|
| 1 | Public Pages | 6 | 5 | 1 | 0 | 83% |
| ... | ... | ... | ... | ... | ... | ... |

## Detailed Findings

### [Section Name]
#### [Test Name] — PASS/FAIL
**What:** [What was tested]
**Result:** [What happened]
**Screenshot:** [path if relevant]
**Suggestion:** [Improvement idea, if any]

## Priority Action Items
1. [Critical] ...
2. [High] ...
3. [Medium] ...

## UX Observations
- [General UX feedback not tied to a specific test]

## Compliance Notes
- [GDPR, MDR, or security observations]
```

## How to Run

```bash
# Install Playwright (one-time)
npx playwright install chromium

# Start dev server in another terminal
npm run dev

# Run the review
npx tsx scripts/prrc-review.ts \
  --email test@example.com \
  --base-url http://localhost:3000
```

The script reads OTP from Supabase admin client (service role key) to automate login without manual email checking.

## Scope Boundaries

- Does NOT test Stripe payment completion (only redirect verification)
- Does NOT run a real multi-day search (uses existing completed runs)
- Does NOT test mobile responsiveness (desktop viewport only for v1)
- Does NOT modify production data (local dev only)
- Screenshots stored in `docs/prrc-review/screenshots/` (gitignored)
