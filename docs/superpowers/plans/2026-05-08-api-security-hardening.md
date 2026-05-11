# API Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent internal error messages from reaching clients and add Zod v4 input validation to all body-parsing API routes.

**Architecture:** Inline fixes in each route file — no new shared modules. Error paths get `console.error` + generic message. Three routes get Zod v4 schemas with `safeParse` validation. One health endpoint gets a 503 status code fix.

**Tech Stack:** Zod 4.3.6 (top-level syntax: `z.literal()`, `z.email()`, `z.iso.date()`), Next.js App Router, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-08-api-security-hardening-design.md`

---

### Task 1: Sanitize error messages in `profiles/route.ts`

**Files:**
- Modify: `app/api/profiles/route.ts:27,92`

- [ ] **Step 1: Replace line 27**

Replace:
```typescript
    return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
    console.error('[profiles:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
```

- [ ] **Step 2: Replace line 92**

Replace:
```typescript
    return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
    console.error('[profiles:POST]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
```

Note: There are two identical `error.message` lines — use surrounding context to target the right one. Line 27 is inside the GET handler; line 92 is inside the POST handler.

- [ ] **Step 3: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep "profiles/route"`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/profiles/route.ts
git commit -m "security: sanitize error messages in profiles API"
```

---

### Task 2: Sanitize error messages in `search-drafts/route.ts`

**Files:**
- Modify: `app/api/search-drafts/route.ts:79,99,117`

- [ ] **Step 1: Replace line 79**

Replace:
```typescript
    if (error) return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
    if (error) {
      console.error('[search-drafts:POST]', error.message)
      return Response.json({ error: 'Something went wrong' }, { status: 500 })
    }
```

- [ ] **Step 2: Replace line 99**

Replace:
```typescript
  if (error) return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[search-drafts:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
```

- [ ] **Step 3: Replace line 117**

Replace:
```typescript
  if (error) return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[search-drafts:DELETE]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
```

- [ ] **Step 4: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep "search-drafts/route"`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/search-drafts/route.ts
git commit -m "security: sanitize error messages in search-drafts API"
```

---

### Task 3: Sanitize error messages in `admin/trial-codes/[batch]/pdf/route.ts`

**Files:**
- Modify: `app/api/admin/trial-codes/[batch]/pdf/route.ts:29`

- [ ] **Step 1: Replace line 29**

Replace:
```typescript
  if (error) return new Response(error.message, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[trial-codes:pdf]', error.message)
    return new Response('Something went wrong', { status: 500 })
  }
```

Note: Keep `new Response()` (plain text) — the happy path returns `text/html`, not JSON.

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/trial-codes/[batch]/pdf/route.ts
git commit -m "security: sanitize error message in trial-codes PDF route"
```

---

### Task 4: Sanitize error messages in admin user routes

**Files:**
- Modify: `app/api/admin/users/[id]/route.ts:17`
- Modify: `app/api/admin/users/[id]/make-admin/route.ts:19`

- [ ] **Step 1: Replace line 17 in `admin/users/[id]/route.ts`**

Replace:
```typescript
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[admin:users:PATCH]', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
```

- [ ] **Step 2: Replace line 19 in `admin/users/[id]/make-admin/route.ts`**

Replace:
```typescript
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[admin:make-admin]', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/users/[id]/route.ts app/api/admin/users/[id]/make-admin/route.ts
git commit -m "security: sanitize error messages in admin user routes"
```

---

### Task 5: Sanitize error messages + fix status code in `worker/health/route.ts`

**Files:**
- Modify: `app/api/worker/health/route.ts:22`

- [ ] **Step 1: Replace line 22**

Replace:
```typescript
    return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
    console.error('[worker:health]', error.message)
    return Response.json({ error: 'Service temporarily unavailable' }, { status: 503 })
```

Note: 503 is correct for health endpoints — monitoring tools (Render, UptimeRobot) interpret it as "temporarily down" rather than "broken."

- [ ] **Step 2: Commit**

```bash
git add app/api/worker/health/route.ts
git commit -m "security: sanitize error message and use 503 in worker health route"
```

---

### Task 6: Sanitize error messages in `reports/route.ts`

**Files:**
- Modify: `app/api/reports/route.ts:491,494`

- [ ] **Step 1: Replace lines 490–495**

Replace:
```typescript
  if (htmlUpload.error) {
    return Response.json({ error: `Report upload failed: ${htmlUpload.error.message}` }, { status: 500 })
  }
  if (excelUpload.error) {
    return Response.json({ error: `Excel upload failed: ${excelUpload.error.message}` }, { status: 500 })
  }
```

With:
```typescript
  if (htmlUpload.error) {
    console.error('[reports:html-upload]', htmlUpload.error.message)
    return Response.json({ error: 'Report generation failed' }, { status: 500 })
  }
  if (excelUpload.error) {
    console.error('[reports:excel-upload]', excelUpload.error.message)
    return Response.json({ error: 'Report generation failed' }, { status: 500 })
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "security: sanitize storage upload error messages in reports route"
```

---

### Task 7: Add Zod v4 validation to `account/delete/route.ts`

**Files:**
- Modify: `app/api/account/delete/route.ts:1-23`

- [ ] **Step 1: Add Zod import and schema at top of file**

After line 3 (`import { logAuditEvent }...`), add:
```typescript
import { z } from 'zod'
```

After line 6 (`const GRACE_PERIOD_DAYS = 30`), add:
```typescript

const DeleteAccountSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
})
```

- [ ] **Step 2: Replace body parsing and validation (lines 15–23)**

Replace:
```typescript
  let body: { confirmation?: string } = {}
  try { body = await request.json() } catch { /* empty body */ }

  if (body.confirmation !== CONFIRMATION_PHRASE) {
    return Response.json(
      { error: `Type "${CONFIRMATION_PHRASE}" to confirm account deletion` },
      { status: 400 }
    )
  }
```

With:
```typescript
  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = DeleteAccountSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: `Type "${CONFIRMATION_PHRASE}" to confirm account deletion` },
      { status: 400 }
    )
  }
```

- [ ] **Step 3: Also sanitize the error on line 38**

Replace:
```typescript
    return Response.json({ error: updateError.message }, { status: 500 })
```

With:
```typescript
    console.error('[account:delete]', updateError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
```

- [ ] **Step 4: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep "account/delete"`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/account/delete/route.ts
git commit -m "security: add Zod validation and sanitize errors in account delete route"
```

---

### Task 8: Add Zod v4 validation to `claim/[code]/route.ts`

**Files:**
- Modify: `app/api/claim/[code]/route.ts:1-21,64-71`

- [ ] **Step 1: Add Zod import**

After line 3 (`import { logAuditEvent }...`), add:
```typescript
import { z } from 'zod'

const ClaimSchema = z.object({
  email: z.email({ pattern: z.regexes.html5Email }),
})
```

- [ ] **Step 2: Replace body parsing and email validation (lines 15–21)**

Replace:
```typescript
  let body: { email?: string } = {}
  try { body = await request.json() } catch { /* empty */ }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return Response.json({ error: 'A valid email address is required.' }, { status: 400 })
  }
```

With:
```typescript
  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ClaimSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'A valid email address is required.' }, { status: 400 })
  }
  const email = parsed.data.email.trim().toLowerCase()
```

- [ ] **Step 3: Sanitize the createUser error (line 70)**

Replace:
```typescript
    return Response.json({ error: createError.message }, { status: 500 })
```

With:
```typescript
    console.error('[claim]', createError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
```

Note: Keep the `already exists` check on line 65–69 as-is — that returns a user-friendly message, not a raw DB error.

- [ ] **Step 4: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep "claim"`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/claim/[code]/route.ts
git commit -m "security: add Zod v4 validation and sanitize errors in claim route"
```

---

### Task 9: Add Zod v4 validation to `admin/trial-codes/route.ts`

**Files:**
- Modify: `app/api/admin/trial-codes/route.ts:17-28,42,57`

- [ ] **Step 1: Add Zod import and schema**

After line 4 (`import { randomBytes }...`), add:
```typescript
import { z } from 'zod'

const CreateTrialCodesSchema = z.object({
  batch_name: z.string().min(1).max(100).default('Unnamed'),
  quantity:   z.number().int().min(1).max(500).default(10),
  expires_at: z.iso.date().optional(),
})
```

- [ ] **Step 2: Replace body parsing and validation in POST (lines 21–28)**

Replace:
```typescript
  let body: { batch_name?: string; quantity?: number; expires_at?: string } = {}
  try { body = await request.json() } catch { /* empty */ }

  const { batch_name = 'Unnamed', quantity = 10, expires_at } = body

  if (quantity < 1 || quantity > 100) {
    return Response.json({ error: 'Quantity must be 1–100' }, { status: 400 })
  }
```

With:
```typescript
  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateTrialCodesSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
  }
  const { batch_name, quantity, expires_at } = parsed.data
```

Note: Zod schema allows quantity up to 500 (spec update from original 100 limit). The schema defaults handle missing fields.

- [ ] **Step 3: Sanitize error on line 42 (POST insert error)**

Replace:
```typescript
  if (error) return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[trial-codes:POST]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
```

- [ ] **Step 4: Sanitize error on line 57 (GET select error)**

Replace:
```typescript
  if (error) return Response.json({ error: error.message }, { status: 500 })
```

With:
```typescript
  if (error) {
    console.error('[trial-codes:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
```

- [ ] **Step 5: Verify TypeScript passes**

Run: `npx tsc --noEmit 2>&1 | grep "trial-codes/route"`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/trial-codes/route.ts
git commit -m "security: add Zod v4 validation and sanitize errors in trial-codes route"
```

---

### Task 10: Full TypeScript check, tests, and push

**Files:**
- All modified files from Tasks 1–9

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit 2>&1`

Expected: 0 errors.

- [ ] **Step 2: Run test suite**

Run: `npx vitest run 2>&1 | tail -10`

Expected: All tests pass, no regressions.

- [ ] **Step 3: Push to remote**

Run: `git push origin main`

Expected: Push succeeds. Verify with `git log --oneline origin/main..HEAD` returning empty.
