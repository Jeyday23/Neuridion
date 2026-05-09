# Security Council Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical (C1-C4) and High (H1-H10) vulnerabilities identified by the 5-agent security council audit.

**Architecture:** Fourteen independent tasks, each producing a self-contained commit. Database changes use new migrations (043-045). No new dependencies. All changes are backward-compatible.

**Tech Stack:** Next.js 16, Supabase PostgreSQL, Zod v4, TypeScript

**Manual action required (C2):** The Supabase management API token (`sb_secret_...`) and anon JWT are in git history. The project owner must: (1) Rotate both tokens in the Supabase dashboard. (2) Update all environment variables. (3) Run `git filter-repo` or BFG Repo Cleaner to purge history. This plan does NOT attempt C2 — it requires manual action.

---

### Task 1: C1 — Fix IDOR on Search Run Review Endpoint

**Files:**
- Modify: `app/api/search-runs/[id]/review/route.ts`

- [ ] **Step 1: Add ownership check after fetching the run**

In `app/api/search-runs/[id]/review/route.ts`, replace lines 41-49:

```typescript
  const { data: existing } = await db
    .from('search_runs')
    .select('id, review_status, user_id')
    .eq('id', id)
    .single()

  if (!existing) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }
```

With:

```typescript
  const { data: existing } = await db
    .from('search_runs')
    .select('id, review_status, user_id')
    .eq('id', id)
    .single()

  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/api/search-runs/[id]/review/route.ts"
git commit -m "security(critical): add ownership check to search run review endpoint

Prevents any authenticated user from reviewing/approving another user's
search runs (IDOR). Only the run owner can initiate the review workflow.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 2: C3 — Fix GDPR Deletion Silent Failure on Append-Only Tables

**Files:**
- Create: `supabase/migrations/043_gdpr_purge_function.sql`
- Modify: `app/api/account/delete/route.ts`

- [ ] **Step 1: Create the GDPR purge migration**

Create `supabase/migrations/043_gdpr_purge_function.sql`:

```sql
-- GDPR Art. 17: allow service_role to delete from append-only tables
-- during account deletion. The DO INSTEAD NOTHING rules block normal
-- deletes; this function temporarily disables them.

CREATE OR REPLACE FUNCTION public.gdpr_purge_user_data(p_run_ids uuid[])
RETURNS void AS $$
BEGIN
  IF array_length(p_run_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.filter_decisions DISABLE RULE no_delete_filter_decisions;
  ALTER TABLE public.profile_edit_history DISABLE RULE prevent_profile_edit_history_delete;

  DELETE FROM public.filter_decisions WHERE search_run_id = ANY(p_run_ids);
  DELETE FROM public.profile_edit_history
    WHERE profile_id IN (
      SELECT DISTINCT profile_id FROM public.search_runs WHERE id = ANY(p_run_ids)
    );

  ALTER TABLE public.filter_decisions ENABLE RULE no_delete_filter_decisions;
  ALTER TABLE public.profile_edit_history ENABLE RULE prevent_profile_edit_history_delete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.gdpr_purge_user_data(uuid[]) TO service_role;
```

- [ ] **Step 2: Update account delete route to use the RPC function**

In `app/api/account/delete/route.ts`, replace lines 82-85:

```typescript
  if (runIds.length > 0) {
    await admin.from('filter_decisions').delete().in('search_run_id', runIds)
    await admin.from('fsn_results').delete().in('run_id', runIds)
  }
```

With:

```typescript
  if (runIds.length > 0) {
    await admin.rpc('gdpr_purge_user_data', { p_run_ids: runIds })
    await admin.from('fsn_results').delete().in('run_id', runIds)
  }
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/043_gdpr_purge_function.sql app/api/account/delete/route.ts
git commit -m "security(critical): fix GDPR deletion silently failing on append-only tables

The filter_decisions and profile_edit_history tables have PostgreSQL rules
that swallow DELETE operations. Account deletion was returning success but
leaving data behind. New SECURITY DEFINER function temporarily disables
rules for GDPR purge, callable only by service_role.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 3: C4 — Add Independent Admin Guard to 3 Admin Pages

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/users/page.tsx`
- Modify: `app/admin/search-runs/page.tsx`

- [ ] **Step 1: Add checkIsAdmin to admin overview page**

In `app/admin/page.tsx`, add import and guard at lines 1-2 and inside the function:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { checkIsAdmin } from '@/lib/admin-guard'
import { redirect } from 'next/navigation'
```

At the top of `AdminOverviewPage()` function body (before `const stats`):

```typescript
  const admin = await checkIsAdmin()
  if (!admin) redirect('/dashboard/search')
```

- [ ] **Step 2: Add checkIsAdmin to admin users page**

In `app/admin/users/page.tsx`, add imports:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { checkIsAdmin } from '@/lib/admin-guard'
import { redirect } from 'next/navigation'
import { UserActions } from './user-actions'
```

At the top of `AdminUsersPage()` function body (before `const users`):

```typescript
  const caller = await checkIsAdmin()
  if (!caller) redirect('/dashboard/search')
```

- [ ] **Step 3: Add checkIsAdmin to admin search-runs page**

In `app/admin/search-runs/page.tsx`, add imports:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { checkIsAdmin } from '@/lib/admin-guard'
import { redirect } from 'next/navigation'
```

At the top of `AdminSearchRunsPage()` function body (before `let runs`):

```typescript
  const caller = await checkIsAdmin()
  if (!caller) redirect('/dashboard/search')
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx app/admin/users/page.tsx app/admin/search-runs/page.tsx
git commit -m "security(critical): add independent admin guard to all admin pages

Three admin pages relied solely on the layout for auth enforcement.
Now each page independently calls checkIsAdmin() as defense-in-depth.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 4: H1 — Fix Open Redirect in Auth Confirm

**Files:**
- Modify: `app/auth/confirm/route.ts`

- [ ] **Step 1: Validate the `next` parameter**

Replace the entire file content of `app/auth/confirm/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const raw = searchParams.get('next') ?? '/dashboard/search'
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard/search'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/auth/confirm/route.ts
git commit -m "security(high): prevent open redirect via auth confirm next parameter

Validates that the next parameter is a relative path starting with /
and not a protocol-relative URL (//evil.com).

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 5: H2 — Require Re-authentication Before Password Change

**Files:**
- Modify: `app/dashboard/settings/settings-client.tsx`

- [ ] **Step 1: Add current password field and re-auth logic**

In `app/dashboard/settings/settings-client.tsx`, add `currentPw` state back. Find the Password state section (around line 36):

```typescript
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
```

Replace with:

```typescript
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
```

Then replace the `changePassword` function (around lines 68-86):

```typescript
  const changePassword = async () => {
    if (!currentPw)             { setPwMsg('Current password is required.'); return }
    if (newPw !== confirmPw)    { setPwMsg('Passwords do not match.'); return }
    if (newPw.length < 10)      { setPwMsg('Password must be at least 10 characters.'); return }
    if (!/[A-Z]/.test(newPw))   { setPwMsg('Password must contain an uppercase letter.'); return }
    if (!/[0-9]/.test(newPw))   { setPwMsg('Password must contain a number.'); return }
    if (!/[^A-Za-z0-9]/.test(newPw)) { setPwMsg('Password must contain a special character.'); return }

    setPwSaving(true)
    setPwMsg('')
    const supabase = createClient()

    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: initialEmail,
      password: currentPw,
    })
    if (reAuthError) {
      setPwMsg('Current password is incorrect.')
      setPwSaving(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setPwMsg(`Error: ${error.message}`)
    } else {
      setPwMsg('Password updated.')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
    setPwSaving(false)
  }
```

Then add the current password input field back in the JSX. Find the password section (the `<section>` with "Change password" heading). After the `<h2>` line, add before the "New password" input:

```tsx
          <div>
            <label className="block text-sm font-medium text-[#134E4A] mb-1.5">Current password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#134E4A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
              placeholder="Enter current password"
            />
          </div>
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/settings/settings-client.tsx
git commit -m "security(high): require current password before password change

Re-authenticates via signInWithPassword before calling updateUser.
Prevents account takeover from XSS or unattended browser sessions.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 6: H3 — Add File Upload Extension Allowlist and Size Limit

**Files:**
- Modify: `app/dashboard/profiles/new/actions.ts`

- [ ] **Step 1: Add validation before upload**

In `app/dashboard/profiles/new/actions.ts`, replace lines 30-43:

```typescript
  let ifuStoragePath: string | null = null
  const ifuFile = formData.get('ifu_file') as File | null
  if (ifuFile && ifuFile.size > 0) {
    const ext = ifuFile.name.split('.').pop()
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('ifu-documents')
      .upload(path, ifuFile, { contentType: ifuFile.type, upsert: false })

    if (uploadError) {
      return { error: `IFU upload failed: ${uploadError.message}` }
    }
    ifuStoragePath = path
  }
```

With:

```typescript
  let ifuStoragePath: string | null = null
  const ifuFile = formData.get('ifu_file') as File | null
  if (ifuFile && ifuFile.size > 0) {
    const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx']
    const MAX_FILE_SIZE = 10 * 1024 * 1024

    const ext = (ifuFile.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { error: 'Only PDF and Word documents are allowed for IFU uploads.' }
    }
    if (ifuFile.size > MAX_FILE_SIZE) {
      return { error: 'File size must not exceed 10 MB.' }
    }

    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('ifu-documents')
      .upload(path, ifuFile, { contentType: ifuFile.type, upsert: false })

    if (uploadError) {
      return { error: 'IFU upload failed. Please try again.' }
    }
    ifuStoragePath = path
  }
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/profiles/new/actions.ts
git commit -m "security(high): add file extension allowlist and size limit to IFU upload

Only PDF and Word documents are accepted. Server-side 10MB limit enforced.
Prevents uploading executable or HTML files.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 7: H7 — Remove Dev Bypass on Worker Endpoints

**Files:**
- Modify: `app/api/worker/process-job/route.ts`
- Modify: `app/api/worker/cleanup/route.ts`

- [ ] **Step 1: Replace dev bypass in process-job**

In `app/api/worker/process-job/route.ts`, replace lines 92-96:

```typescript
export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'development') return handler(req)
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  return verifySignatureAppRouter(handler)(req)
}
```

With:

```typescript
export async function POST(req: Request): Promise<Response> {
  if (process.env.ENABLE_DEV_WORKER_BYPASS === 'true') return handler(req)
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  return verifySignatureAppRouter(handler)(req)
}
```

- [ ] **Step 2: Replace dev bypass in cleanup**

In `app/api/worker/cleanup/route.ts`, replace lines 83-87:

```typescript
export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'development') return postHandler(req)
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  return verifySignatureAppRouter(postHandler)(req)
}
```

With:

```typescript
export async function POST(req: Request): Promise<Response> {
  if (process.env.ENABLE_DEV_WORKER_BYPASS === 'true') return postHandler(req)
  const { verifySignatureAppRouter } = await import('@upstash/qstash/nextjs')
  return verifySignatureAppRouter(postHandler)(req)
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add "app/api/worker/process-job/route.ts" "app/api/worker/cleanup/route.ts"
git commit -m "security(high): replace NODE_ENV dev bypass with explicit opt-in flag

Worker endpoints no longer skip QStash signature verification based on
NODE_ENV. Requires explicit ENABLE_DEV_WORKER_BYPASS=true, which is
never set in production.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 8: H8 + H9 — Storage Bucket RLS Scoping + Privilege Escalation Trigger Update

**Files:**
- Create: `supabase/migrations/044_scope_storage_and_escalation.sql`

- [ ] **Step 1: Create the combined migration**

Create `supabase/migrations/044_scope_storage_and_escalation.sql`:

```sql
-- H8: Scope search-attachments bucket reads to the uploading user's folder.
-- Upload paths follow the pattern {user_id}/{key}_{filename}.
DROP POLICY IF EXISTS "attachments_select_authenticated" ON storage.objects;
CREATE POLICY "attachments_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'search-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- H9: Extend privilege escalation trigger to protect new columns added
-- in migrations 040 (processing_restricted, ai_opt_out) and 012 (consent_*).
-- Also protect email to prevent public.users/auth.users mismatch.
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.role                    := OLD.role;
    NEW.plan                    := OLD.plan;
    NEW.email                   := OLD.email;
    NEW.stripe_customer_id      := OLD.stripe_customer_id;
    NEW.stripe_subscription_id  := OLD.stripe_subscription_id;
    NEW.stripe_price_id         := OLD.stripe_price_id;
    NEW.subscription_status     := OLD.subscription_status;
    NEW.current_period_end      := OLD.current_period_end;
    NEW.deletion_requested_at   := OLD.deletion_requested_at;
    NEW.deleted_at              := OLD.deleted_at;
    NEW.processing_restricted   := OLD.processing_restricted;
    NEW.ai_opt_out              := OLD.ai_opt_out;
    NEW.consent_terms_at        := OLD.consent_terms_at;
    NEW.consent_privacy_at      := OLD.consent_privacy_at;
    NEW.consent_cookies_at      := OLD.consent_cookies_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/044_scope_storage_and_escalation.sql
git commit -m "security(high): scope storage bucket RLS + extend privilege escalation trigger

H8: search-attachments bucket now only allows users to read their own
folder, preventing cross-user file access.
H9: Privilege escalation trigger now protects email, consent timestamps,
processing_restricted, and ai_opt_out columns.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 9: H10 — Add safeHref to Client-Side Source URL Links

**Files:**
- Modify: `app/dashboard/search/search-panel.tsx`
- Modify: `app/dashboard/archive/[id]/run-results.tsx`

- [ ] **Step 1: Add safeHref helper and apply it in search-panel.tsx**

At the top of `app/dashboard/search/search-panel.tsx`, after the existing imports, add:

```typescript
function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}
```

Then find line 131 (`href={result.source_url}`) and replace with:
```typescript
              href={safeHref(result.source_url)}
```

Find line 173 (`href={result.source_url}`) and replace with:
```typescript
              <a href={safeHref(result.source_url)} target="_blank" rel="noopener noreferrer"
```

- [ ] **Step 2: Add safeHref helper and apply it in run-results.tsx**

At the top of `app/dashboard/archive/[id]/run-results.tsx`, after the existing imports, add:

```typescript
function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}
```

Then find line 67 (`href={result.source_url ?? '#'}`) and replace with:
```typescript
              href={safeHref(result.source_url)}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/search/search-panel.tsx "app/dashboard/archive/[id]/run-results.tsx"
git commit -m "security(high): validate URL protocol on client-side source links

Adds safeHref() to search-panel.tsx and run-results.tsx, matching the
validation already used in report HTML generation. Prevents javascript:
protocol XSS if scraper data is poisoned.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 10: H4 — Add Rate Limiting to Expensive Unprotected Routes

**Files:**
- Modify: `app/api/search-runs/[id]/retry/route.ts`
- Modify: `app/api/billing/checkout/route.ts`
- Modify: `app/api/billing/portal/route.ts`
- Modify: `app/api/account/export/route.ts`

- [ ] **Step 1: Add rate limiting to retry route**

In `app/api/search-runs/[id]/retry/route.ts`, add import at top:

```typescript
import { rateLimit, getClientIp } from '@/lib/rate-limit'
```

At the start of the POST handler function body (after auth check, before any logic):

```typescript
  const ip = getClientIp(request)
  const rl = rateLimit(`retry:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many retry requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }
```

- [ ] **Step 2: Add rate limiting to billing/checkout**

In `app/api/billing/checkout/route.ts`, add import at top:

```typescript
import { rateLimit, getClientIp } from '@/lib/rate-limit'
```

After the auth check in the POST handler, add:

```typescript
  const ip = getClientIp(request)
  const rl = rateLimit(`checkout:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }
```

- [ ] **Step 3: Add rate limiting to billing/portal**

In `app/api/billing/portal/route.ts`, add import at top:

```typescript
import { rateLimit, getClientIp } from '@/lib/rate-limit'
```

After the auth check in the POST handler, add:

```typescript
  const ip = getClientIp(request)
  const rl = rateLimit(`portal:${user.id}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }
```

- [ ] **Step 4: Add rate limiting to account/export**

In `app/api/account/export/route.ts`, add import at top:

```typescript
import { rateLimit, getClientIp } from '@/lib/rate-limit'
```

After the auth check in the GET handler, add:

```typescript
  const ip = getClientIp(request)
  const rl = rateLimit(`export:${user.id}`, 3, 300_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many export requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add "app/api/search-runs/[id]/retry/route.ts" app/api/billing/checkout/route.ts app/api/billing/portal/route.ts app/api/account/export/route.ts
git commit -m "security(high): add rate limiting to retry, billing, and export routes

Prevents abuse of expensive operations: retry (burns AI credits),
checkout/portal (creates Stripe sessions), export (heavy DB queries).
Uses user-ID-based keys for authenticated routes.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 11: M1 — Sanitize Login and Signup Error Messages

**Files:**
- Modify: `app/login/actions.ts`
- Modify: `app/signup/actions.ts`

- [ ] **Step 1: Sanitize login error**

In `app/login/actions.ts`, replace lines 36-38:

```typescript
  if (error) {
    return { error: error.message }
  }
```

With:

```typescript
  if (error) {
    console.error('[login]', error.message)
    return { error: 'Invalid email or password.' }
  }
```

- [ ] **Step 2: Sanitize signup error**

In `app/signup/actions.ts`, replace lines 66-68:

```typescript
  if (error) {
    return { error: error.message }
  }
```

With:

```typescript
  if (error) {
    console.error('[signup]', error.message)
    return { error: 'Unable to create account. Please try again.' }
  }
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/login/actions.ts app/signup/actions.ts
git commit -m "security: sanitize login and signup error messages

Prevents email enumeration via raw Supabase error messages
('User already registered', 'Invalid login credentials').

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 12: M9 — HTML-Escape User Input in Notification Emails

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Add escHtml and apply to all user-supplied values**

In `lib/email.ts`, add the escHtml function near the top (after imports):

```typescript
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

Then find every instance where user-supplied values are interpolated into HTML template strings and wrap them with `escHtml()`. Look for variables like `mostUseful`, `missing`, `summary.deviceName`, `summary.manufacturer`, `summary.relevantCount`, `summary.period`, and any string from user input. Apply `escHtml()` to all string interpolations inside HTML backtick templates.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "security: HTML-escape user input in notification email templates

Prevents HTML injection in feedback and search run notification emails
sent to admins.

Co-Authored-By: RuFlo <ruv@ruv.net>"
```

---

### Task 13: Apply Migrations 043-044 to Live Supabase

**Files:** None (remote database operation)

- [ ] **Step 1: Apply migration 043 (GDPR purge function)**

Use the Supabase MCP tool `execute_sql` with project_id `mifvyttraodneyfkdcik` to run the contents of `supabase/migrations/043_gdpr_purge_function.sql`.

- [ ] **Step 2: Apply migration 044 (storage + escalation trigger)**

Use the Supabase MCP tool `execute_sql` with project_id `mifvyttraodneyfkdcik` to run the contents of `supabase/migrations/044_scope_storage_and_escalation.sql`.

- [ ] **Step 3: Verify migrations applied**

Run SQL to verify: `SELECT proname FROM pg_proc WHERE proname = 'gdpr_purge_user_data';` — should return 1 row.

Run SQL to verify: `SELECT polname FROM pg_policies WHERE tablename = 'objects' AND polname = 'attachments_select_own';` — should return 1 row.

---

### Task 14: Final TypeScript Check, Commit, and Push

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run git status and verify all changes are committed**

Run: `git status`
Expected: Clean working tree (no uncommitted changes related to security fixes)

- [ ] **Step 3: Push all commits to remote**

Run: `git push origin main`

- [ ] **Step 4: End-of-session checklist**

Run: `git log --oneline origin/main..HEAD`
Expected: No local-only commits (all pushed)
