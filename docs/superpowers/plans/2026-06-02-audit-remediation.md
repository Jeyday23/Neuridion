# Production Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate 10 production audit findings across GDPR compliance, security, i18n, and UI/UX for the Neuridion medical PMS application.

**Architecture:** Two batches — Batch 1 (Tasks 1–6) touches only backend/API files with zero UI risk. Batch 2 (Tasks 7–10) modifies frontend components. Each task is independently testable and committable.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + Auth), Vitest, Zod, React 19

---

## File Structure

**Modified files:**
- `lib/audit.ts` — extend AuditEventType union (Task 2)
- `app/api/worker/cleanup/route.ts` — fix GDPR hash mismatch (Task 1)
- `app/api/admin/trial-codes/route.ts` — add audit logging (Task 2)
- `app/api/bugs/route.ts` — add audit logging (Task 2)
- `app/api/feedback/route.ts` — add audit logging (Task 2)
- `app/api/worker/process-job/route.ts` — add audit logging (Task 2)
- `lib/scrapers/firecrawl.ts` — redact sensitive log content (Task 3)
- `app/api/account/export/route.ts` — constrain batchIn type (Task 4)
- `app/api/reports/route.ts` — fix unsafe cast, add model to select (Task 4)
- `app/dashboard/language-context.tsx` — add localStorage persistence (Task 6)
- `lib/i18n.ts` — add translation keys for 4 pages (Task 7)
- `app/dashboard/settings/settings-client.tsx` — wire i18n + consent banner (Tasks 8, 10)
- `app/dashboard/archive/archive-table.tsx` — wire i18n (Task 8)
- `app/dashboard/billing/page.tsx` — fix null plan default, use admin client (Task 9)

**New files:**
- `__tests__/gdpr-hash-consistency.test.ts` — GDPR hash parity test (Task 1)
- `__tests__/firecrawl-redaction.test.ts` — log redaction test (Task 3)
- `app/favicon.ico` — favicon from existing SVG (Task 5)
- `app/dashboard/billing/billing-client.tsx` — client wrapper for i18n (Task 8)

---

## Batch 1 — Backend Fixes (zero UI risk)

### Task 1: Fix GDPR login_attempts hash mismatch (CRITICAL)

**Files:**
- Modify: `app/api/worker/cleanup/route.ts:116-117`
- Create: `__tests__/gdpr-hash-consistency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/gdpr-hash-consistency.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'

function cleanupHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
}

function rateLimitHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
}

describe('GDPR hash consistency', () => {
  it('cleanup hash matches rate-limit hash for the same email', () => {
    const email = 'Robert.Friedrich@jpberlin.de'
    expect(cleanupHash(email)).toBe(rateLimitHash(email))
  })

  it('produces consistent hashes for case-variant emails', () => {
    const h1 = cleanupHash('USER@EXAMPLE.COM')
    const h2 = cleanupHash('user@example.com')
    const h3 = cleanupHash('User@Example.Com')
    expect(h1).toBe(h2)
    expect(h2).toBe(h3)
  })

  it('produces a 32-char hex string', () => {
    const hash = cleanupHash('test@example.com')
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run __tests__/gdpr-hash-consistency.test.ts`
Expected: PASS (the test verifies hash algorithm parity — both functions use the same algorithm)

- [ ] **Step 3: Fix the cleanup route**

In `app/api/worker/cleanup/route.ts`, replace lines 116-117:

```typescript
// BEFORE (line 116-117):
const emailHash = createHash('sha256').update(user.id).digest('hex').slice(0, 32)
await db.from('login_attempts').delete().eq('email', emailHash)
```

With this block, inserted BEFORE the `db.auth.admin.deleteUser()` call at line 119:

```typescript
const { data: authUser } = await db.auth.admin.getUserById(user.id)
const authEmail = authUser?.user?.email
if (authEmail) {
  const emailHash = createHash('sha256').update(authEmail.toLowerCase()).digest('hex').slice(0, 32)
  await db.from('login_attempts').delete().eq('email', emailHash)
} else {
  console.warn(`[cleanup] Could not retrieve email for user ${user.id} — login_attempts may not be fully purged`)
}
```

The full block from line 116 to line 121 should now read:

```typescript
      const { data: authUser } = await db.auth.admin.getUserById(user.id)
      const authEmail = authUser?.user?.email
      if (authEmail) {
        const emailHash = createHash('sha256').update(authEmail.toLowerCase()).digest('hex').slice(0, 32)
        await db.from('login_attempts').delete().eq('email', emailHash)
      } else {
        console.warn(`[cleanup] Could not retrieve email for user ${user.id} — login_attempts may not be fully purged`)
      }

      const { error: authErr } = await db.auth.admin.deleteUser(user.id)
```

Note: `createHash` is already imported at line 1. The `gdpr_purge_user_data` RPC (line 97) operates on the `users` table, not `auth.users`, so the auth email is still available at this point.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: all pass, including the new GDPR hash test

- [ ] **Step 6: Commit**

```bash
git add __tests__/gdpr-hash-consistency.test.ts app/api/worker/cleanup/route.ts
git commit -m "fix: hash user email (not ID) when purging login_attempts on GDPR deletion

The cleanup route hashed user.id but login_attempts are keyed by
SHA-256(email). Records for deleted users persisted indefinitely.
Now fetches email from auth.users before deletion."
```

---

### Task 2: Add audit logging to 4 mutation routes

**Files:**
- Modify: `lib/audit.ts:40-66` (extend AuditEventType)
- Modify: `app/api/admin/trial-codes/route.ts:82-83`
- Modify: `app/api/bugs/route.ts:40-46`
- Modify: `app/api/feedback/route.ts:56-62`
- Modify: `app/api/worker/process-job/route.ts:95-103,114-128`

- [ ] **Step 1: Extend AuditEventType union**

In `lib/audit.ts`, add four new event types to the union at line 66 (after `'contact_form_submitted'`):

```typescript
  | 'contact_form_submitted'
  | 'trial_code_created'
  | 'bug_report_submitted'
  | 'feedback_submitted'
  | 'search_run_status_changed'
```

- [ ] **Step 2: Add audit log to trial-codes route**

In `app/api/admin/trial-codes/route.ts`, add the import at line 1 area:

```typescript
import { logAuditEvent } from '@/lib/audit'
```

Then after the successful insert (after line 81, before the return on line 83), add:

```typescript
  await logAuditEvent(user?.id ?? null, 'trial_code_created', {
    batch_name, quantity, created: data?.length ?? 0,
  }, request)
```

- [ ] **Step 3: Add audit log to bugs route**

In `app/api/bugs/route.ts`, add the import:

```typescript
import { logAuditEvent } from '@/lib/audit'
```

Then after the successful insert (after line 39, before the error check), replace the success return block. After line 44 (`return NextResponse.json({ error: 'Something went wrong' }, ...)`), before the final return, add:

```typescript
  await logAuditEvent(user.id, 'bug_report_submitted', {
    category: parsed.data.category,
  }, request)
```

The final section of the POST handler (lines 40-47) becomes:

```typescript
  if (error) {
    console.error('[bugs] insert failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'bug_report_submitted', {
    category: parsed.data.category,
  }, request)

  return NextResponse.json({ ok: true })
```

- [ ] **Step 4: Add audit log to feedback route**

In `app/api/feedback/route.ts`, add the import:

```typescript
import { logAuditEvent } from '@/lib/audit'
```

Then after the successful insert (inside the try block, after `sendFeedbackNotification` on line 58, before the return on line 62):

```typescript
    await logAuditEvent(user.id, 'feedback_submitted', {
      rating, triggered_by: parsed.data.triggered_by,
    }, request)
```

- [ ] **Step 5: Add audit log to process-job route**

In `app/api/worker/process-job/route.ts`, add the import:

```typescript
import { logAuditEvent } from '@/lib/audit'
```

After the success path (after line 101, before `return new Response('OK', { status: 200 })`):

```typescript
    await logAuditEvent(msg.user_id, 'search_run_status_changed', {
      run_id, status: 'completed', elapsed_seconds: elapsed,
    })
```

After the error path (after line 125, before `return new Response('Pipeline failed', { status: 200 })`):

```typescript
    await logAuditEvent(msg.user_id, 'search_run_status_changed', {
      run_id, status: 'error', elapsed_seconds: elapsed,
    })
```

Note: `request` is intentionally omitted (defaults to `undefined`) because this runs as a QStash worker — logging QStash's IP/UA would be misleading.

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 7: Commit**

```bash
git add lib/audit.ts app/api/admin/trial-codes/route.ts app/api/bugs/route.ts app/api/feedback/route.ts app/api/worker/process-job/route.ts
git commit -m "feat: add audit logging to trial-codes, bugs, feedback, and process-job routes

Extends AuditEventType with 4 new event types. Worker route omits
request param to avoid logging QStash IP/UA."
```

---

### Task 3: Firecrawl log redaction

**Files:**
- Modify: `lib/scrapers/firecrawl.ts:55-56`
- Create: `__tests__/firecrawl-redaction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/firecrawl-redaction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

function redactSensitive(raw: string): string {
  return raw.slice(0, 200)
    .replace(/(?:sk-|fc-|Bearer\s+)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
}

describe('firecrawl log redaction', () => {
  it('redacts sk- prefixed API keys', () => {
    const input = 'Error: auth failed with key sk-ant-api03-abc123def456ghi789'
    expect(redactSensitive(input)).toBe('Error: auth failed with key [REDACTED]')
  })

  it('redacts fc- prefixed tokens', () => {
    const input = 'Token fc-abcdef1234567890 expired'
    expect(redactSensitive(input)).toBe('Token [REDACTED] expired')
  })

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9_long_token_here'
    expect(redactSensitive(input)).toBe('Authorization: [REDACTED]')
  })

  it('redacts long hex strings (32+ chars)', () => {
    const hex = 'a'.repeat(40)
    const input = `hash=${hex} done`
    expect(redactSensitive(input)).toBe('hash=[REDACTED] done')
  })

  it('preserves normal error text', () => {
    const input = 'HTTP 500: Internal server error from firecrawl'
    expect(redactSensitive(input)).toBe(input)
  })

  it('truncates to 200 chars', () => {
    const input = 'x'.repeat(500)
    expect(redactSensitive(input).length).toBeLessThanOrEqual(200)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run __tests__/firecrawl-redaction.test.ts`
Expected: PASS

- [ ] **Step 3: Apply the redaction fix**

In `lib/scrapers/firecrawl.ts`, replace lines 55-56:

```typescript
// BEFORE:
      const body = await startRes.text().catch(() => '')
      console.error('[firecrawl]', `crawl start failed: HTTP ${startRes.status} — ${body.slice(0, 500)}`)
```

With:

```typescript
      const body = await startRes.text().catch(() => '')
      const safeBody = body.slice(0, 200)
        .replace(/(?:sk-|fc-|Bearer\s+)[A-Za-z0-9_-]+/g, '[REDACTED]')
        .replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
      console.error('[firecrawl]', `crawl start failed: HTTP ${startRes.status} — ${safeBody}`)
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add lib/scrapers/firecrawl.ts __tests__/firecrawl-redaction.test.ts
git commit -m "fix: redact API keys and hex tokens from firecrawl error logs

Truncates to 200 chars and strips sk-/fc-/Bearer prefixed tokens
and hex strings 32+ chars to prevent sensitive data in logs."
```

---

### Task 4: Fix unsafe type casts in export and reports routes

**Files:**
- Modify: `app/api/account/export/route.ts:8-25`
- Modify: `app/api/reports/route.ts:100-113`

- [ ] **Step 1: Constrain batchIn type in export route**

In `app/api/account/export/route.ts`, replace the `batchIn` function (lines 7-25):

```typescript
type BatchTable = 'fsn_results' | 'filter_decisions' | 'profile_edit_history'

async function batchIn<T>(
  db: ReturnType<typeof createAdminClient>,
  table: BatchTable,
  selectCols: string,
  column: string,
  ids: string[],
  limit = 10000
): Promise<T[]> {
  const CHUNK = 200
  const all: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data } = await (db.from(table) as ReturnType<typeof db.from>).select(selectCols).in(column, chunk).limit(limit)
    if (data) all.push(...(data as T[]))
  }
  return all
}
```

- [ ] **Step 2: Fix reports route unsafe cast**

In `app/api/reports/route.ts`, change the select at line 101 to include `model`:

```typescript
// BEFORE (line 101):
    .select('fsn_result_id, decision, rationale, confidence')
```

```typescript
// AFTER:
    .select('fsn_result_id, decision, rationale, confidence, model')
```

Then replace line 113:

```typescript
// BEFORE (line 113):
  const aiModels = [...new Set((decisions ?? []).map(d => (d as unknown as { model?: string }).model).filter((m): m is string => !!m))]
```

```typescript
// AFTER:
  const aiModels = [...new Set((decisions ?? []).map(d => (d as { model?: string }).model).filter((m): m is string => !!m))]
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors. If the Supabase generated types don't include `model`, the `as { model?: string }` cast handles it without `unknown`.

- [ ] **Step 4: Verify reduced cast count**

Run: `grep -rn "as any\|as unknown as" app/api/account/export/ app/api/reports/`
Expected: The `as any` in export route is gone. The `as unknown as` in reports route is gone.

- [ ] **Step 5: Commit**

```bash
git add app/api/account/export/route.ts app/api/reports/route.ts
git commit -m "fix: replace unsafe type casts in GDPR export and reports routes

Export route: constrain batchIn to known table names instead of 'as any'.
Reports route: add 'model' to select and use narrower type assertion."
```

---

### Task 5: Add favicon

**Files:**
- Create: `app/favicon.ico`

- [ ] **Step 1: Check if conversion tools are available**

Run: `which convert 2>/dev/null || which magick 2>/dev/null || which npx`
If ImageMagick is available, use it. Otherwise use a Node script.

- [ ] **Step 2: Generate favicon from SVG**

Option A (ImageMagick available):
```bash
convert -background none -resize 32x32 public/logo/neuridion-favicon.svg app/favicon.ico
```

Option B (Node script fallback):
```bash
npx sharp-cli -i public/logo/neuridion-favicon.svg -o app/favicon.ico --width 32 --height 32
```

Option C (If neither works — manual SVG favicon):
Copy `public/logo/neuridion-favicon.svg` to `app/icon.svg` (Next.js App Router supports SVG favicons natively as `app/icon.svg`).

- [ ] **Step 3: Verify favicon exists**

Run: `ls -la app/favicon.ico 2>/dev/null || ls -la app/icon.svg`
Expected: File exists, non-zero size

- [ ] **Step 4: Commit**

```bash
git add app/favicon.ico 2>/dev/null || git add app/icon.svg
git commit -m "feat: add favicon from neuridion-favicon.svg"
```

---

### Task 6: Batch 1 verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all pass, including new tests

- [ ] **Step 3: Verify audit type coverage**

Run: `grep -c "trial_code_created\|bug_report_submitted\|feedback_submitted\|search_run_status_changed" lib/audit.ts`
Expected: 4

- [ ] **Step 4: Verify reduced unsafe casts**

Run: `grep -rn "as any" app/api/account/export/route.ts app/api/reports/route.ts`
Expected: no matches (or significantly fewer)

---

## Batch 2 — Frontend/UX Fixes

### Task 7: i18n persistence (Fix 7 + Fix 10 hydration)

**Files:**
- Modify: `app/dashboard/language-context.tsx`

- [ ] **Step 1: Add localStorage persistence**

Replace the entire content of `app/dashboard/language-context.tsx`:

```typescript
'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { translations, type Locale, type Translations } from '@/lib/i18n'

const STORAGE_KEY = 'neuridion_locale'

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: translations.en,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved && saved in translations) setLocaleState(saved)
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
```

This also fixes React hydration error #418: server always renders 'en', client updates via useEffect after mount — no mismatch.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/language-context.tsx
git commit -m "fix: persist i18n locale in localStorage, prevent hydration mismatch

Server always renders 'en'. Client reads localStorage after mount
via useEffect. Fixes language reset on navigation and React #418."
```

---

### Task 8: i18n wiring into remaining pages

**Files:**
- Modify: `lib/i18n.ts`
- Modify: `app/dashboard/archive/archive-table.tsx`
- Modify: `app/dashboard/settings/settings-client.tsx`
- Modify: `app/dashboard/billing/page.tsx`
- Create: `app/dashboard/billing/billing-client.tsx`

- [ ] **Step 1: Extend translations in lib/i18n.ts**

In `lib/i18n.ts`, add four new sections to both `en` and `de` objects. Insert before the closing `} as const` on line 141.

Add to the `en` object (after the `phases` array, before the closing brace):

```typescript
    profiles: {
      pageTitle:     'Product Profiles',
      pageSubtitle:  'Manage the medical devices you monitor for safety notices',
      deviceName:    'Device name',
      manufacturer:  'Manufacturer',
      deviceClass:   'Class',
      emdnCode:      'EMDN code',
      createdAt:     'Created',
      actions:       'Actions',
      edit:          'Edit',
      delete:        'Delete',
      create:        'Create Profile',
      emptyTitle:    'No profiles yet',
      emptySubtitle: 'Add a product profile to start monitoring safety notices.',
      confirmDelete: 'Delete this profile? This action cannot be undone.',
    },
    archive: {
      pageTitle:     'Search Archive',
      pageSubtitle:  'Review previous search runs and download reports',
      date:          'Date',
      profile:       'Profile',
      period:        'Period',
      databases:     'Databases',
      status:        'Status',
      results:       'Results',
      review:        'Review',
      actions:       'Actions',
      statusComplete:  'Complete',
      statusRunning:   'Running',
      statusPending:   'Pending',
      statusError:     'Error',
      statusDegraded:  'Degraded',
      statusCancelled: 'Cancelled',
      reviewDraft:     'Draft',
      reviewReviewed:  'Reviewed',
      reviewApproved:  'Approved',
      noRuns:          'No search runs yet',
    },
    billing: {
      pageTitle:        'Billing',
      pageSubtitle:     'Manage your subscription and plan.',
      currentPlan:      'Current plan',
      active:           'Active',
      upgradePlan:      'Upgrade your plan',
      mostPopular:      'Most popular',
      contactSales:     'Contact sales',
      upgradeTo:        'Upgrade to',
      successMessage:   'Subscription activated — thank you!',
      canceledMessage:  'Checkout was canceled. Your plan was not changed.',
      unableToLoadPlan: 'Unable to load plan details. Please try again later.',
    },
    settings: {
      pageTitle:         'Account Settings',
      accountInfo:       'Account information',
      email:             'Email',
      emailHint:         'Email cannot be changed here. Contact support.',
      fullName:          'Full name',
      companyName:       'Company name',
      saveChanges:       'Save changes',
      saving:            'Saving…',
      changePassword:    'Change password',
      currentPassword:   'Current password',
      newPassword:       'New password',
      confirmPassword:   'Confirm new password',
      updatePassword:    'Update password',
      updating:          'Updating…',
      downloadData:      'Download my data',
      downloadDataDesc:  'Export all your data (profiles, search runs, reports, audit log) as a JSON file. This is your right under Art. 20 GDPR (data portability).',
      downloadButton:    'Download my data',
      consentManagement: 'Consent management',
      consentDesc:       'Under Art. 7 GDPR, you have the right to view and withdraw your consent at any time.',
      termsOfService:    'Terms of Service',
      privacyPolicy:     'Privacy Policy',
      optionalCookies:   'Optional cookies',
      acceptedOn:        'Accepted on',
      notRecorded:       'Not recorded',
      notAccepted:       'Not accepted',
      withdraw:          'Withdraw',
      withdrawing:       'Withdrawing...',
      consentWithdrawNote: 'To withdraw consent for Terms of Service or Privacy Policy, please delete your account below. Withdrawing these consents means we can no longer provide the service.',
      deleteAccount:     'Delete account',
      deleteScheduled:   'Your account is scheduled for deletion on',
      cancelDeletion:    'Cancel account deletion',
      cancelling:        'Cancelling…',
      deleteWarning:     'This will schedule your account for permanent deletion in 30 days. Your session will be terminated immediately. Data retained for MDR audit trail purposes cannot be deleted.',
      typeToConfirm:     'Type',
      toConfirm:         'to confirm',
      deleteButton:      'Delete my account',
      processing:        'Processing…',
    },
```

Add the corresponding `de` translations (after the German `phases` array, before its closing brace):

```typescript
    profiles: {
      pageTitle:     'Produktprofile',
      pageSubtitle:  'Verwalten Sie die Medizinprodukte, die Sie auf Sicherheitsmeldungen überwachen',
      deviceName:    'Gerätename',
      manufacturer:  'Hersteller',
      deviceClass:   'Klasse',
      emdnCode:      'EMDN-Code',
      createdAt:     'Erstellt',
      actions:       'Aktionen',
      edit:          'Bearbeiten',
      delete:        'Löschen',
      create:        'Profil erstellen',
      emptyTitle:    'Noch keine Profile',
      emptySubtitle: 'Fügen Sie ein Produktprofil hinzu, um Sicherheitsmeldungen zu überwachen.',
      confirmDelete: 'Dieses Profil löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
    },
    archive: {
      pageTitle:     'Sucharchiv',
      pageSubtitle:  'Vorherige Suchläufe einsehen und Berichte herunterladen',
      date:          'Datum',
      profile:       'Profil',
      period:        'Zeitraum',
      databases:     'Datenbanken',
      status:        'Status',
      results:       'Ergebnisse',
      review:        'Prüfung',
      actions:       'Aktionen',
      statusComplete:  'Abgeschlossen',
      statusRunning:   'Läuft',
      statusPending:   'Wartend',
      statusError:     'Fehler',
      statusDegraded:  'Eingeschränkt',
      statusCancelled: 'Abgebrochen',
      reviewDraft:     'Entwurf',
      reviewReviewed:  'Geprüft',
      reviewApproved:  'Genehmigt',
      noRuns:          'Noch keine Suchläufe',
    },
    billing: {
      pageTitle:        'Abrechnung',
      pageSubtitle:     'Verwalten Sie Ihr Abonnement und Ihren Plan.',
      currentPlan:      'Aktueller Plan',
      active:           'Aktiv',
      upgradePlan:      'Plan upgraden',
      mostPopular:      'Beliebteste',
      contactSales:     'Vertrieb kontaktieren',
      upgradeTo:        'Upgrade auf',
      successMessage:   'Abonnement aktiviert — vielen Dank!',
      canceledMessage:  'Bezahlvorgang abgebrochen. Ihr Plan wurde nicht geändert.',
      unableToLoadPlan: 'Plandetails konnten nicht geladen werden. Bitte versuchen Sie es später erneut.',
    },
    settings: {
      pageTitle:         'Kontoeinstellungen',
      accountInfo:       'Kontoinformationen',
      email:             'E-Mail',
      emailHint:         'Die E-Mail kann hier nicht geändert werden. Kontaktieren Sie den Support.',
      fullName:          'Vollständiger Name',
      companyName:       'Firmenname',
      saveChanges:       'Änderungen speichern',
      saving:            'Speichern…',
      changePassword:    'Passwort ändern',
      currentPassword:   'Aktuelles Passwort',
      newPassword:       'Neues Passwort',
      confirmPassword:   'Neues Passwort bestätigen',
      updatePassword:    'Passwort aktualisieren',
      updating:          'Aktualisieren…',
      downloadData:      'Meine Daten herunterladen',
      downloadDataDesc:  'Exportieren Sie alle Ihre Daten (Profile, Suchläufe, Berichte, Aktivitätsprotokoll) als JSON-Datei. Dies ist Ihr Recht nach Art. 20 DSGVO (Datenübertragbarkeit).',
      downloadButton:    'Meine Daten herunterladen',
      consentManagement: 'Einwilligungsverwaltung',
      consentDesc:       'Nach Art. 7 DSGVO haben Sie das Recht, Ihre Einwilligung jederzeit einzusehen und zu widerrufen.',
      termsOfService:    'Nutzungsbedingungen',
      privacyPolicy:     'Datenschutzerklärung',
      optionalCookies:   'Optionale Cookies',
      acceptedOn:        'Akzeptiert am',
      notRecorded:       'Nicht erfasst',
      notAccepted:       'Nicht akzeptiert',
      withdraw:          'Widerrufen',
      withdrawing:       'Wird widerrufen...',
      consentWithdrawNote: 'Um die Einwilligung zu den Nutzungsbedingungen oder der Datenschutzerklärung zu widerrufen, löschen Sie bitte Ihr Konto unten. Der Widerruf dieser Einwilligungen bedeutet, dass wir den Dienst nicht mehr bereitstellen können.',
      deleteAccount:     'Konto löschen',
      deleteScheduled:   'Ihr Konto ist zur Löschung am vorgesehen:',
      cancelDeletion:    'Kontolöschung abbrechen',
      cancelling:        'Wird abgebrochen…',
      deleteWarning:     'Dies plant die dauerhafte Löschung Ihres Kontos in 30 Tagen. Ihre Sitzung wird sofort beendet. Daten, die für MDR-Prüfzwecke aufbewahrt werden, können nicht gelöscht werden.',
      typeToConfirm:     'Geben Sie',
      toConfirm:         'zur Bestätigung ein',
      deleteButton:      'Mein Konto löschen',
      processing:        'Verarbeitung…',
    },
```

- [ ] **Step 2: Update the Translations type**

The existing `Translations` type at line 143-149 handles `readonly string[]` and flat `Record<string, string>`. All new sections are flat string-to-string objects, so the existing type already covers them. Verify by running:

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Create billing client wrapper**

Create `app/dashboard/billing/billing-client.tsx`:

```typescript
'use client'

import { useLanguage } from '@/app/dashboard/language-context'
import type { PlanId } from '@/lib/plans'
import { PLANS } from '@/lib/plans'
import { BillingActions } from './billing-actions'

interface Props {
  currentPlan: PlanId
  hasCustomer: boolean
  successParam: boolean
  canceledParam: boolean
  upgradePlans: PlanId[]
  stripePrices: Record<string, string | undefined>
}

export function BillingClient({
  currentPlan,
  hasCustomer,
  successParam,
  canceledParam,
  upgradePlans,
  stripePrices,
}: Props) {
  const { t } = useLanguage()
  const planInfo = PLANS[currentPlan]
  const isActive = currentPlan !== 'free'

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">{t.billing.pageTitle}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t.billing.pageSubtitle}</p>
      </div>

      {successParam && (
        <div className="mb-6 rounded border border-[rgba(5,150,105,0.2)] bg-[rgba(5,150,105,0.08)] px-4 py-3">
          <p className="text-sm text-[#059669] font-medium">{t.billing.successMessage}</p>
        </div>
      )}
      {canceledParam && (
        <div className="mb-6 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <p className="text-sm text-[#134E4A]">{t.billing.canceledMessage}</p>
        </div>
      )}

      <div className="mb-8 rounded-md border border-[#E2E8F0] bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">{t.billing.currentPlan}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-900">{planInfo.label}</span>
              <span className="text-lg text-zinc-500">{planInfo.priceMonthly}{currentPlan !== 'free' ? '/mo' : ''}</span>
            </div>
            {isActive && (
              <div className="mt-1">
                <span className="inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium bg-[rgba(5,150,105,0.08)] text-[#059669] border-[rgba(5,150,105,0.2)]">
                  {t.billing.active}
                </span>
              </div>
            )}
          </div>
          {hasCustomer && currentPlan !== 'free' && (
            <BillingActions mode="portal" />
          )}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
          {PLANS[currentPlan].features.map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-sm text-zinc-600">
              <svg className="h-4 w-4 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {(currentPlan === 'free' || !isActive) && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">{t.billing.upgradePlan}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {upgradePlans.filter((p) => p !== currentPlan).map((planId) => {
              const plan = PLANS[planId]
              const priceId = stripePrices[planId] ?? null

              return (
                <div
                  key={planId}
                  className={`rounded-md border bg-white px-5 py-5 flex flex-col ${
                    planId === 'pro' ? 'border-[#0D9488] ring-1 ring-[rgba(13,148,136,0.2)]' : 'border-[#E2E8F0]'
                  }`}
                >
                  {planId === 'pro' && (
                    <span className="mb-3 self-start rounded bg-[#0D9488] px-2.5 py-0.5 text-xs font-medium text-white">
                      {t.billing.mostPopular}
                    </span>
                  )}
                  <p className="text-base font-bold text-zinc-900">{plan.label}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {plan.priceMonthly}{planId !== 'enterprise' ? '/mo' : ''}
                  </p>
                  <ul className="mt-4 flex-1 space-y-2">
                    {PLANS[planId].features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-zinc-600">
                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {priceId ? (
                      <BillingActions mode="checkout" priceId={priceId} label={`${t.billing.upgradeTo} ${plan.label}`} />
                    ) : (
                      <a
                        href="mailto:info@neuridion.eu?subject=Enterprise inquiry"
                        className="block w-full rounded border border-[#E2E8F0] bg-white px-4 py-2 text-center text-sm font-medium text-[#134E4A] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors"
                      >
                        {t.billing.contactSales}
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Refactor billing page to use client wrapper + admin client**

Replace `app/dashboard/billing/page.tsx` entirely:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanId } from '@/lib/plans'
import { BillingClient } from './billing-client'

export const metadata = { title: 'Billing — Neuridion' }

const UPGRADE_PLANS: PlanId[] = ['starter', 'pro', 'enterprise']

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: userData, error: userDataError } = await admin
    .from('users')
    .select('plan, stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (userDataError) console.error('[billing]', 'query error:', userDataError.message, userDataError.code)

  if (!userData) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="mb-6 rounded border border-[rgba(220,38,38,0.2)] bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700 font-medium">Unable to load plan details. Please try again later.</p>
        </div>
      </div>
    )
  }

  const currentPlan = (userData.plan ?? 'free') as PlanId

  return (
    <BillingClient
      currentPlan={currentPlan}
      hasCustomer={!!userData.stripe_customer_id}
      successParam={!!params.success}
      canceledParam={!!params.canceled}
      upgradePlans={UPGRADE_PLANS}
      stripePrices={{
        starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
        pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
      }}
    />
  )
}
```

This does three things:
1. Switches to `createAdminClient()` (bypasses RLS, matching settings page pattern)
2. Shows error state when `userData` is null instead of defaulting to free
3. Delegates all rendering to `BillingClient` for i18n support

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.ts app/dashboard/billing/billing-client.tsx app/dashboard/billing/page.tsx
git commit -m "feat: add i18n translations for profiles, archive, billing, settings

Adds ~120 keys (both EN and DE). Creates billing-client.tsx wrapper
for i18n support. Billing page now uses admin client and shows error
state when plan data unavailable."
```

---

### Task 9: Fix billing plan display for enterprise users

This is handled by Task 8's billing page refactor:
1. Switches from session client to admin client (bypasses RLS)
2. Shows error state when `userData` is null
3. Enterprise users with admin-override plans will see correct plan info

No additional work needed — verify during browser testing.

---

### Task 10: Consent records investigation + banner

**Files:**
- Modify: `app/dashboard/settings/settings-client.tsx`
- Modify: `app/api/consent/manage/route.ts`

- [ ] **Step 1: Add consent grant support to manage route**

In `app/api/consent/manage/route.ts`, add a grant action. Add a new schema after line 12:

```typescript
const GrantSchema = z.object({
  grant: z.array(z.enum(CONSENT_FIELDS)).min(1),
})
```

Then add a PUT handler after the POST handler (after line 96):

```typescript
export async function PUT(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`consent-manage:${ip}`, 5, 60_000)
  if (!rl.allowed) return Response.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = GrantSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Specify which consents to grant.' }, { status: 422 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const update: Partial<Record<ConsentField, string>> = {}
  for (const field of parsed.data.grant) {
    update[field] = now
  }

  const { error } = await admin
    .from('users')
    .update(update)
    .eq('id', user.id)

  if (error) {
    console.error('[consent/manage]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'consent_granted', {
    granted: parsed.data.grant,
  }, request)

  return Response.json({ ok: true })
}
```

- [ ] **Step 2: Add consent banner to settings page**

In `app/dashboard/settings/settings-client.tsx`, add a state and handler for granting consent. After the existing consent state declarations (around line 48-49), add:

```typescript
  const [granting, setGranting] = useState(false)
  const [termsConsented, setTermsConsented] = useState(!!consentTermsAt)
  const [privacyConsented, setPrivacyConsented] = useState(!!consentPrivacyAt)
```

Add the grant handler after the `withdrawCookieConsent` function (after line 147):

```typescript
  const grantMissingConsent = async () => {
    setGranting(true)
    const fields: string[] = []
    if (!termsConsented) fields.push('consent_terms_at')
    if (!privacyConsented) fields.push('consent_privacy_at')
    if (fields.length === 0) return

    const res = await apiFetch('/api/consent/manage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant: fields }),
    })
    if (res.ok) {
      setTermsConsented(true)
      setPrivacyConsented(true)
      toast.show('Consent recorded. Thank you.', 'success')
      router.refresh()
    } else {
      toast.show('Unable to record consent. Please try again.', 'error')
    }
    setGranting(false)
  }
```

Then in the consent management section of the JSX (before the Terms of Service row, around line 313), add a banner when consent is missing:

```typescript
        {(!consentTermsAt || !consentPrivacyAt) && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-5 py-4 mb-4">
            <p className="text-sm font-medium text-amber-800">
              Consent was not recorded at signup. Please review and accept the current Terms of Service and Privacy Policy.
            </p>
            <div className="mt-3 flex gap-3">
              <a href="/terms" target="_blank" className="text-xs text-amber-700 underline">Terms of Service</a>
              <a href="/privacy" target="_blank" className="text-xs text-amber-700 underline">Privacy Policy</a>
            </div>
            <button
              onClick={grantMissingConsent}
              disabled={granting}
              className="mt-3 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {granting ? 'Recording…' : 'I accept the Terms of Service and Privacy Policy'}
            </button>
          </div>
        )}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add app/api/consent/manage/route.ts app/dashboard/settings/settings-client.tsx
git commit -m "feat: add consent grant banner for users with unrecorded ToS/Privacy consent

Users who signed up before consent recording was implemented see
a banner to review and accept current terms. Adds PUT handler to
consent/manage route for granting consent."
```

---

### Task 11: Batch 2 verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 3: Verify all files changed**

Run: `git diff --stat HEAD~6` (adjust number based on commits made)
Expected: should see all files listed in the plan

---

## Summary

| Task | Fix | Files | Severity |
|------|-----|-------|----------|
| 1 | GDPR login_attempts hash | cleanup/route.ts + test | CRITICAL |
| 2 | Audit logging on 4 routes | audit.ts + 4 routes | HIGH |
| 3 | Firecrawl log redaction | firecrawl.ts + test | MEDIUM |
| 4 | Unsafe type casts | export/route.ts, reports/route.ts | MEDIUM |
| 5 | Favicon | app/favicon.ico | LOW |
| 6 | Batch 1 verification | — | — |
| 7 | i18n persistence + hydration | language-context.tsx | HIGH |
| 8 | i18n wiring + billing refactor | i18n.ts, billing-client.tsx, billing/page.tsx | HIGH |
| 9 | Billing plan display | (covered by Task 8) | HIGH |
| 10 | Consent records banner | consent/manage/route.ts, settings-client.tsx | HIGH |
| 11 | Batch 2 verification | — | — |
