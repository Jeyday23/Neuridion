# CSP Nonces + Bug Reports + Feedback Trigger Design

## Feature 1: CSP Nonces

### Problem
`next.config.ts` sets `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'` — any injected script/style executes freely.

### Solution
Move CSP header generation from `next.config.ts` (static) to `proxy.ts` (per-request). Generate a cryptographic nonce per request, include it in the CSP header, and pass it to the root layout via a request header so Next.js Script components can use it.

### Changes
- `proxy.ts` — Generate nonce via `crypto.randomUUID()`, set `x-nonce` header on request, set CSP header on response with `'nonce-<value>'` replacing `'unsafe-inline'`
- `next.config.ts` — Remove the CSP header (keep all other security headers)
- `app/layout.tsx` — Read nonce from `headers()`, pass to Script components if any

### Note
Tailwind CSS generates utility classes at build time (not inline styles), so removing `'unsafe-inline'` from `style-src` may break Next.js's own inline styles. We'll keep `'unsafe-inline'` for `style-src` only and remove it from `script-src` — this is the standard Next.js recommendation.

---

## Feature 2: Bug/Error Reporting

### Problem
Users have no way to report issues. Errors are silently lost.

### Solution
Add a help menu icon (CircleHelp) in the dashboard header bar. Clicking opens a dropdown with "Report an Issue". The form captures: category (bug/suggestion/question), description, and optional page context. Reports go to a `bug_reports` table and appear in admin at `/admin/bugs`.

### Database
New table `bug_reports`:
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users)
- `category` (text: 'bug' | 'suggestion' | 'question')
- `description` (text)
- `page_url` (text, captured automatically)
- `user_agent` (text)
- `status` (text: 'open' | 'in_progress' | 'resolved' | 'closed', default 'open')
- `admin_notes` (text, nullable)
- `created_at` (timestamptz, default now())

RLS: users can INSERT their own reports, admins can SELECT/UPDATE all.

### API
- `POST /api/bugs` — Create bug report (auth required, rate limited)

### UI
- Help icon in dashboard header (between language selector and right edge)
- Click opens dropdown: "Report an Issue" + "Give Feedback" (opens existing feedback popup)
- "Report an Issue" opens a modal with category select + description textarea
- Admin page at `/admin/bugs` with status filters and admin notes

---

## Feature 3: Feedback Popup Trigger Change

### Problem
Current trigger: only after first search ever (once, using localStorage `neuridion-has-searched`).

### Solution
Show after every completed search that returns results, unless dismissed in the last 7 days (down from 30). Keep the same FeedbackPopup component, just change the trigger logic.

### Changes
- `search-panel.tsx` — Remove `hasSearchedBefore` check. Show popup after every `state.phase === 'done'` with results, subject to the 7-day dismiss cooldown.
- `FeedbackPopup.tsx` — Reduce dismiss duration from 30 days to 7 days.
