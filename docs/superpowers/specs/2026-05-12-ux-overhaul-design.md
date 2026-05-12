# UX Overhaul — Design Spec

**Goal:** Replace all loading spinners with skeleton loaders, add aggressive caching, optimistic rendering for all mutations, feature discovery tooltips, quota visibility, rate limit feedback, and a global error toast system.

**Architecture:** React 19 native (useOptimistic, Server Actions) + Next.js 16 unstable_cache/revalidateTag + Radix Tooltip + custom Tailwind skeleton primitive. Zero new dependencies except @radix-ui/react-tooltip (~3KB).

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Tailwind CSS v4, Radix UI

---

## Pillar 1: Skeleton Loaders

### Problem
12 instances of `<Loader2 className="animate-spin" />` across 7 files. No `loading.tsx` files for dashboard routes (except one empty Suspense boundary). Users see a blank page or spinning icon with no structural hint of what's coming.

### Design

**Shared component:** `app/components/ui/Skeleton.tsx`
- A `div` with `animate-pulse`, `bg-zinc-200`, `rounded` accepting `className` for width/height
- Includes `role="status"` and `aria-label="Loading"` for screen readers
- Usage: `<Skeleton className="h-4 w-32" />`

**Route-level skeletons via `loading.tsx`:**

| Route | Skeleton layout |
|---|---|
| `/dashboard` | Sidebar + welcome card + stats grid |
| `/dashboard/archive` | Table header + 6 shimmer rows |
| `/dashboard/archive/[id]` | Meta card + tab bar + 8 result rows |
| `/dashboard/profiles` | 3 profile cards with shimmer |
| `/dashboard/profiles/[id]/edit` | Form fields shimmer |
| `/dashboard/search` | Full search panel form skeleton |
| `/dashboard/billing` | Plan card + usage bar |
| `/dashboard/settings` | Settings form skeleton |

**Inline skeletons** for client-component loading states (e.g. search status widget polling, archive actions).

### Files
- Create: `app/components/ui/Skeleton.tsx`
- Create: `app/dashboard/loading.tsx`
- Create: `app/dashboard/archive/loading.tsx`
- Create: `app/dashboard/archive/[id]/loading.tsx`
- Create: `app/dashboard/profiles/loading.tsx`
- Create: `app/dashboard/profiles/[id]/edit/loading.tsx`
- Create: `app/dashboard/search/loading.tsx`
- Create: `app/dashboard/billing/loading.tsx`
- Create: `app/dashboard/settings/loading.tsx`
- Modify: 7 files to replace Loader2 spinners with Skeleton or remove them (loading.tsx handles it)

---

## Pillar 2: Server-Side Caching

### Problem
Every page load hits Supabase fresh. No caching anywhere. Profiles list, archive list, and run detail pages are read-heavy and rarely change.

### Design

Use `unstable_cache` (verify API against Next.js 16 docs via context7 before implementation) with `revalidateTag` for cache invalidation.

**Cached queries:**

| Query | Cache tag | Revalidate on |
|---|---|---|
| Profiles list | `profiles:{user_id}` | Profile create/edit/delete |
| Archive list | `archive:{user_id}` | New search run completes |
| Run detail + results | `run:{run_id}` | Review status change |
| User settings | `user:{user_id}` | Settings update |
| Dashboard layout (user record) | `user:{user_id}` | Plan change, settings |

**Invalidation:** Each mutation (Server Action or API route) calls `revalidateTag('profiles:{user_id}')` after the write succeeds.

**Safety:** Tags are scoped per user_id. Cross-user cache pollution is impossible because the cache key includes the user ID. Test with two users to verify isolation.

### Files
- Modify: `app/dashboard/search/page.tsx` (cache profiles query)
- Modify: `app/dashboard/archive/page.tsx` (cache archive query)
- Modify: `app/dashboard/archive/[id]/page.tsx` (cache run detail)
- Modify: `app/dashboard/profiles/page.tsx` (cache profiles list)
- Modify: `app/dashboard/settings/page.tsx` (cache user record)
- Modify: `app/dashboard/billing/page.tsx` (cache user record)
- Modify: `app/dashboard/layout.tsx` (cache user record)
- Modify: All mutation endpoints to call revalidateTag after writes

---

## Pillar 3: Optimistic Rendering (Phased)

### Problem
Every mutation shows a spinner, waits for the server response, then updates UI. Users feel lag on every action.

### Design

Convert mutations to Server Actions. Use React 19 `useOptimistic` for instant UI updates with automatic rollback on error.

**Phase 1 — Profile CRUD:**
- Create profile → optimistically add to list
- Edit profile → optimistically update fields
- Delete profile → optimistically remove from list

**Phase 2 — Search drafts + Review status:**
- Save draft → optimistically show "Saved" state
- Review status change → optimistically update badge (draft → reviewed → approved)

**Phase 3 — Settings:**
- Name/email update → optimistically update display
- Password change → no optimistic (security-sensitive, wait for confirmation)

**Error handling:** On Server Action failure, `useOptimistic` automatically rolls back. Show error toast (Pillar 7) explaining what went wrong.

### Files
- Create: `app/dashboard/profiles/actions.ts` (Server Actions for profile CRUD)
- Create: `app/dashboard/search/actions.ts` (Server Action for draft save)
- Create: `app/dashboard/archive/[id]/actions.ts` (Server Action for review status)
- Create: `app/dashboard/settings/actions.ts` (Server Actions for settings)
- Modify: `app/dashboard/profiles/page.tsx` (useOptimistic for list)
- Modify: `app/dashboard/profiles/[id]/edit/edit-form.tsx` (useOptimistic for form)
- Modify: `app/dashboard/archive/[id]/run-results.tsx` (useOptimistic for review)
- Modify: `app/dashboard/search/search-panel.tsx` (useOptimistic for drafts)
- Modify: `app/dashboard/settings/settings-client.tsx` (useOptimistic for name/email)

---

## Pillar 4: Feature Discovery Tooltips

### Problem
Domain-specific terms (EMDN codes, search strategy, AI confidence) are not self-explanatory. New users don't know what fields mean or how to use features effectively.

### Design

**Dependency:** `@radix-ui/react-tooltip` (~3KB gzipped)

**Shared component:** `app/components/ui/InfoTooltip.tsx`
- Wraps Radix Tooltip with a small info icon (`lucide-react` `Info` or `HelpCircle`)
- Props: `text: string` (tooltip content)
- Renders inline next to the label it explains
- Accessible: keyboard focusable, proper ARIA attributes (handled by Radix)

**Tooltip placements:**

| Location | Field | Tooltip text |
|---|---|---|
| Search panel | EMDN code input | "European Medical Device Nomenclature — a standardised code classifying your device type (e.g. Z12030101). Find yours at the EUDAMED database." |
| Search panel | Search strategy | "Controls how search terms are generated from your device profile. 'Auto' extracts manufacturer name tokens automatically." |
| Search panel | Database checkboxes | "Select which regulatory databases to search. BfArM (Germany), MHRA (UK), FDA MAUDE (USA), Swissmedic (Switzerland)." |
| Run results | AI confidence score | "How confident the AI is in its relevance classification (0–100%). Results below 60% are marked 'uncertain' for manual review." |
| Run results | Review status badge | "PRRC review workflow: Draft → Reviewed → Approved. EU MDR requires documented review of PMS evidence by the Person Responsible for Regulatory Compliance." |
| Dashboard sidebar | Plan limits | "Your current plan allows X searches and Y profiles per month. Upgrade for higher limits." |
| Profile form | Intended use field | "Describe your device's intended purpose as stated in your technical documentation. Used by the AI to assess FSN relevance." |

### Files
- Install: `@radix-ui/react-tooltip`
- Create: `app/components/ui/InfoTooltip.tsx`
- Modify: `app/dashboard/search/search-panel.tsx` (3 tooltips)
- Modify: `app/dashboard/archive/[id]/run-results.tsx` (2 tooltips)
- Modify: `app/dashboard/sidebar-nav.tsx` (1 tooltip on plan limits)
- Modify: `app/dashboard/profiles/[id]/edit/edit-form.tsx` (1 tooltip)

---

## Pillar 5: Quota Visibility

### Problem
Users don't know how many searches or profiles they have left until they hit the limit. Plan limits are defined in `lib/plans.ts` but not surfaced in the UI.

### Design

**Dashboard sidebar component:** `QuotaBar`
- Shows "Searches: 3 / 15 used" with a progress bar
- Shows "Profiles: 1 / 3 used" with a progress bar
- Color coding: green (<70%), amber (70-90%), red (>90%)
- Links to billing page when at limit

**Data source:** Count from `search_runs` (this month, user_id) and `product_profiles` (user_id). Query in dashboard layout (cached via Pillar 2).

### Files
- Create: `app/components/ui/QuotaBar.tsx`
- Modify: `app/dashboard/sidebar-nav.tsx` (add QuotaBar below nav links)
- Modify: `app/dashboard/layout.tsx` (pass counts as props)

---

## Pillar 6: Rate Limit Feedback

### Problem
When rate limiting kicks in (429 response), users see a generic error or nothing. No indication they should slow down.

### Design

**Approach:** Create a `fetchWithToast` wrapper (or intercept in a shared fetch utility) that detects 429 status codes and shows a specific toast: "Too many requests — please wait a moment and try again."

For the Upstash-backed rate limiter, the API routes already return `429` status. The client-side just needs to handle it gracefully.

**Retry-After header:** If the API returns `Retry-After`, show the countdown in the toast.

### Files
- Create: `lib/fetch-with-toast.ts` (shared fetch wrapper)
- Modify: Client components that call fetch directly (search-panel, archive-actions, billing-actions, settings-client) to use the wrapper

---

## Pillar 7: Error Message Cleanup

### Problem
Raw Supabase errors ("relation does not exist"), raw `Error: ...` strings, and inconsistent error patterns across settings, archive, and profiles pages. Some errors expose internal details.

### Design

**Global toast system:** `app/components/ui/Toast.tsx`
- 4 types: success (green), error (red), warning (amber), info (blue)
- Auto-dismiss after 5s (errors stay until dismissed)
- Stacks up to 3 toasts
- Accessible: `role="alert"` for errors, `role="status"` for info/success

**Error message map:**

| Raw error pattern | User-facing message |
|---|---|
| `auth` / `session` / `JWT` | "Your session has expired. Please log in again." |
| `quota` / `exceeded` / `limit` | "You've reached your plan limit. Upgrade for more." |
| `429` / `rate` | "Too many requests — please wait a moment." |
| `network` / `fetch` / `ECONNREFUSED` | "Connection lost — please check your internet." |
| `permission` / `RLS` / `denied` | "You don't have permission for this action." |
| Everything else | "Something went wrong. Please try again." |

**Toast context:** `app/components/ui/ToastProvider.tsx` — React context wrapping the dashboard layout. Components call `useToast().show('message', 'error')`.

### Files
- Create: `app/components/ui/Toast.tsx`
- Create: `app/components/ui/ToastProvider.tsx`
- Modify: `app/dashboard/layout.tsx` (wrap with ToastProvider)
- Modify: `app/dashboard/settings/settings-client.tsx` (replace inline error strings)
- Modify: `app/dashboard/archive/archive-actions.tsx` (replace inline error handling)
- Modify: `app/dashboard/billing/billing-actions.tsx` (replace inline error handling)
- Modify: `app/login/sign-in-page.tsx` (replace inline error handling)

---

## Skipped: Token Streaming

AI filter runs as a batch classifier in `run-search.ts` → `filter-pipeline.ts`. No chat or interactive AI interface exists. Streaming would require restructuring the entire pipeline for zero UX benefit. The existing search-status polling (SearchContext + search-status-widget) is the correct pattern for showing progress during a search run.

---

## Dependencies

| Package | Version | Size | Purpose |
|---|---|---|---|
| `@radix-ui/react-tooltip` | latest | ~3KB gzip | Accessible tooltips |

No other new dependencies. Everything else uses React 19 + Next.js 16 built-ins.

## Implementation Order

1. Skeleton component + loading.tsx files (foundation — everything else can show skeletons)
2. Toast system + ToastProvider (foundation — error handling and optimistic rollback need it)
3. Error message cleanup (uses toast system)
4. Rate limit feedback (uses toast system)
5. Tooltips (independent, no dependencies)
6. Quota visibility (independent, needs layout data)
7. Server-side caching (requires context7 API verification first)
8. Optimistic rendering (most complex, requires Server Actions + caching in place)
