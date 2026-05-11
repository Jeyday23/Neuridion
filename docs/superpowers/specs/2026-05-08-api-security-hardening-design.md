# API Security Hardening — Error Sanitization & Zod Validation

**Date:** 2026-05-08
**Status:** Approved (revised after cross-check)
**Owner:** Jeremiah

## Purpose

Harden all API routes for production by (1) preventing internal database error messages from reaching clients and (2) adding Zod v4 input validation to every route that parses a request body.

## Part 1: Error Message Sanitization

### Problem

13 locations across 8 files return `error.message` from Supabase directly to the client. These messages can expose table names, column names, constraint names, and RLS policy details.

### Fix Pattern

Replace every client-facing `error.message` with a generic string and log the real error server-side:

```typescript
// Before
if (error) return Response.json({ error: error.message }, { status: 500 })

// After
if (error) {
  console.error('[profiles]', error.message)
  return Response.json({ error: 'Something went wrong' }, { status: 500 })
}
```

### Affected Files

| File | Occurrences | Notes |
|---|---|---|
| `app/api/profiles/route.ts` | 2 | GET and POST error paths |
| `app/api/search-drafts/route.ts` | 3 | GET, POST, DELETE error paths |
| `app/api/admin/trial-codes/route.ts` | 2 | GET and POST error paths |
| `app/api/admin/trial-codes/[batch]/pdf/route.ts` | 1 | Uses `new Response(error.message)` — keep as plain text `new Response('Something went wrong', { status: 500 })` (happy path returns `text/html`, not JSON) |
| `app/api/admin/users/[id]/route.ts` | 1 | PATCH error path |
| `app/api/admin/users/[id]/make-admin/route.ts` | 1 | POST error path |
| `app/api/worker/health/route.ts` | 1 | GET error path — change status to **503** (monitoring tools interpret this as "temporarily down" vs 500 "broken") |
| `app/api/reports/route.ts` | 2 | Storage upload errors — replace `"Report upload failed: ${msg}"` with `"Report generation failed"` |

## Part 2: Zod Input Validation

### Zod Version Note

Project uses **Zod 4.3.6**. New schemas use Zod v4 top-level syntax (`z.email()`, `z.iso.date()`, `z.literal()`). Existing routes still use deprecated v3 method syntax (`z.string().email()`) — migrating those is a separate task.

### Problem

12 mutation routes lack Zod validation. Of these, 3 parse `request.json()` bodies without schema validation. The other 9 are bodyless actions (logout, cancel, retry, etc.) that don't need body validation.

### Routes Needing Zod

#### `app/api/account/delete/route.ts`

Current body parsing:
```typescript
let body: { confirmation?: string } = {}
try { body = await request.json() } catch { /* empty body */ }
if (body.confirmation !== CONFIRMATION_PHRASE) { ... }
```

Zod schema (enforces the exact confirmation phrase at validation time):
```typescript
const DeleteAccountSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
})
```

#### `app/api/claim/[code]/route.ts`

Current body parsing:
```typescript
let body: { email?: string } = {}
try { body = await request.json() } catch { /* empty */ }
```

Zod schema (uses HTML5 email regex for browser-compatible validation, suitable for external users):
```typescript
const ClaimSchema = z.object({
  email: z.email({ pattern: z.regexes.html5Email }),
})
```

#### `app/api/admin/trial-codes/route.ts`

Current body parsing:
```typescript
let body: { batch_name?: string; quantity?: number; expires_at?: string } = {}
try { body = await request.json() } catch { /* empty */ }
```

Zod schema (uses `z.iso.date()` because the frontend sends date-only strings from `<input type="date">`):
```typescript
const CreateTrialCodesSchema = z.object({
  batch_name: z.string().min(1).max(100).default('Unnamed'),
  quantity: z.number().int().min(1).max(500).default(10),
  expires_at: z.iso.date().optional(),
})
```

### Validation Pattern

Matches existing routes (profiles, search-drafts, review):
```typescript
const parsed = Schema.safeParse(body)
if (!parsed.success) {
  return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
}
```

## Files Changed (Total: 10)

**Error sanitization only (7 files):**
- `app/api/profiles/route.ts` (already has Zod from prior work)
- `app/api/search-drafts/route.ts`
- `app/api/admin/trial-codes/[batch]/pdf/route.ts`
- `app/api/admin/users/[id]/route.ts`
- `app/api/admin/users/[id]/make-admin/route.ts`
- `app/api/worker/health/route.ts` (also change 500 → 503)
- `app/api/reports/route.ts` (already has inline uuid validation)

**Error sanitization + Zod (1 file):**
- `app/api/admin/trial-codes/route.ts`

**Zod only (2 files):**
- `app/api/account/delete/route.ts`
- `app/api/claim/[code]/route.ts`

## Out of Scope

- Zod for bodyless POST routes (logout, cancel, retry, consent/cookies)
- Migrating existing routes from Zod v3 to v4 syntax (separate cleanup task)
- Structured logging library (future work)
- Console.log cleanup (separate task)
- Rate limiting changes
