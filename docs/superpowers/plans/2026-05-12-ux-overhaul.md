# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all loading spinners with skeletons, add a global toast system, feature discovery tooltips, quota visibility, rate limit feedback, server-side caching, and optimistic rendering.

**Architecture:** React 19 native features (useOptimistic, Server Actions) + Next.js 16 unstable_cache/revalidateTag + Radix Tooltip + custom Tailwind skeleton/toast primitives. Single new dependency: @radix-ui/react-tooltip.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Tailwind CSS v4, Radix UI, Lucide React

---

## File Structure

### New files (create)
- `app/components/ui/Skeleton.tsx` — Shared skeleton primitive
- `app/components/ui/Toast.tsx` — Toast notification component
- `app/components/ui/ToastProvider.tsx` — Toast context provider
- `app/components/ui/InfoTooltip.tsx` — Feature discovery tooltip wrapper
- `app/components/ui/QuotaBar.tsx` — Plan quota progress bar
- `app/dashboard/loading.tsx` — Dashboard root skeleton
- `app/dashboard/archive/loading.tsx` — Archive list skeleton
- `app/dashboard/archive/[id]/loading.tsx` — Run detail skeleton
- `app/dashboard/profiles/loading.tsx` — Profiles list skeleton
- `app/dashboard/profiles/[id]/edit/loading.tsx` — Edit form skeleton
- `app/dashboard/search/loading.tsx` — Search panel skeleton
- `app/dashboard/billing/loading.tsx` — Billing skeleton
- `app/dashboard/settings/loading.tsx` — Settings skeleton

### Modified files
- `app/dashboard/dashboard-client-shell.tsx` — Wrap with ToastProvider
- `app/dashboard/sidebar-nav.tsx` — Add QuotaBar + plan tooltip
- `app/dashboard/layout.tsx` — Pass quota counts to sidebar
- `app/dashboard/search/search-panel.tsx` — Replace spinners, add tooltips, use global toast
- `app/dashboard/archive/archive-actions.tsx` — Replace inline errors with toast
- `app/dashboard/billing/billing-actions.tsx` — Replace inline errors with toast
- `app/dashboard/settings/settings-client.tsx` — Replace inline error strings with toast
- `app/dashboard/profiles/[id]/edit/edit-form.tsx` — Replace Loader2 spinner, add tooltip
- `app/dashboard/search-status-widget.tsx` — Replace Loader2 with skeleton pulse
- `app/login/sign-in-page.tsx` — Replace error strings with friendly messages

---

### Task 1: Skeleton Component

**Files:**
- Create: `app/components/ui/Skeleton.tsx`
- Test: `__tests__/skeleton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/skeleton.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react' // if available, otherwise skip
// Minimal test: verify the module exports correctly
import { Skeleton } from '../app/components/ui/Skeleton'

describe('Skeleton', () => {
  it('exports a Skeleton component', () => {
    expect(Skeleton).toBeDefined()
    expect(typeof Skeleton).toBe('function')
  })
})
```

> **Note:** If `@testing-library/react` is not installed, write the test as a simple import assertion:
> ```tsx
> import { Skeleton } from '../app/components/ui/Skeleton'
> import { describe, it, expect } from 'vitest'
> describe('Skeleton', () => { it('exports', () => { expect(Skeleton).toBeDefined() }) })
> ```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/skeleton.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the Skeleton component**

Create `app/components/ui/Skeleton.tsx`:

```tsx
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('animate-pulse rounded bg-zinc-200', className)}
      {...props}
    />
  )
}
```

> **Check:** Does `@/lib/utils` export `cn`? Search the codebase. If not, the component should use `clsx` + `tailwind-merge` inline:
> ```tsx
> import { clsx } from 'clsx'
> import { twMerge } from 'tailwind-merge'
> function cn(...inputs: (string | undefined | null | false)[]) { return twMerge(clsx(inputs)) }
> ```
> Or check if there's a `cn` utility already. The project uses `clsx` and `tailwind-merge` — check `lib/` for an existing `cn` export.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/skeleton.test.tsx`
Expected: PASS

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add app/components/ui/Skeleton.tsx __tests__/skeleton.test.tsx
git commit -m "feat: add Skeleton component primitive

Co-Authored-By: Neuridion"
```

---

### Task 2: Route-Level Loading Skeletons

**Files:**
- Create: `app/dashboard/loading.tsx`
- Create: `app/dashboard/archive/loading.tsx`
- Create: `app/dashboard/profiles/loading.tsx`
- Create: `app/dashboard/profiles/[id]/edit/loading.tsx`
- Create: `app/dashboard/search/loading.tsx`
- Create: `app/dashboard/billing/loading.tsx`
- Create: `app/dashboard/settings/loading.tsx`
- Create: `app/dashboard/archive/[id]/loading.tsx`

Each `loading.tsx` must match the real page's layout structure. These are Server Components (no `'use client'`).

- [ ] **Step 1: Create dashboard root loading skeleton**

Create `app/dashboard/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create archive list loading skeleton**

Create `app/dashboard/archive/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function ArchiveLoading() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create run detail loading skeleton**

Create `app/dashboard/archive/[id]/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function RunDetailLoading() {
  return (
    <div className="p-8">
      <Skeleton className="h-7 w-64 mb-2" />
      <Skeleton className="h-4 w-48 mb-6" />
      <div className="rounded-md border border-zinc-200 bg-white p-6 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-5 w-32" /></div>
          <div><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-5 w-24" /></div>
          <div><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-5 w-20" /></div>
        </div>
      </div>
      <div className="flex gap-2 border-b border-zinc-200 mb-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 rounded" />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create profiles list loading skeleton**

Create `app/dashboard/profiles/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function ProfilesLoading() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-9 w-28 rounded" />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-20" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-7 w-12 rounded" />
              <Skeleton className="h-7 w-14 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create edit form loading skeleton**

Create `app/dashboard/profiles/[id]/edit/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function EditProfileLoading() {
  return (
    <div className="p-8 max-w-2xl">
      <Skeleton className="h-7 w-36 mb-6" />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
          <div><Skeleton className="h-4 w-28 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
          <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
        </div>
        <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-24 w-full rounded-lg" /></div>
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create search panel loading skeleton**

Create `app/dashboard/search/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function SearchLoading() {
  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <Skeleton className="w-10 h-10 rounded-md" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-4 w-72 ml-14" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-md border border-zinc-200 p-8">
          <Skeleton className="h-6 w-40 mb-6" />
          {i === 1 ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-16 rounded" />
              ))}
            </div>
          ) : (
            <Skeleton className="h-10 w-full max-w-md rounded" />
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Create billing loading skeleton**

Create `app/dashboard/billing/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function BillingLoading() {
  return (
    <div className="p-8 max-w-2xl">
      <Skeleton className="h-7 w-24 mb-6" />
      <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2 w-full rounded-full mt-4" />
        <Skeleton className="h-10 w-40 rounded-lg mt-4" />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create settings loading skeleton**

Create `app/dashboard/settings/loading.tsx`:

```tsx
import { Skeleton } from '@/app/components/ui/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="p-8 max-w-2xl space-y-10">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-md border border-zinc-200 bg-white p-6">
          <Skeleton className="h-6 w-44 mb-5" />
          <div className="space-y-4">
            <div><Skeleton className="h-4 w-16 mb-2" /><Skeleton className="h-10 w-full rounded" /></div>
            <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded" /></div>
            <Skeleton className="h-10 w-32 rounded mt-2" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 9: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 10: Commit**

```bash
git add app/dashboard/loading.tsx app/dashboard/archive/loading.tsx app/dashboard/archive/\[id\]/loading.tsx app/dashboard/profiles/loading.tsx app/dashboard/profiles/\[id\]/edit/loading.tsx app/dashboard/search/loading.tsx app/dashboard/billing/loading.tsx app/dashboard/settings/loading.tsx
git commit -m "feat: add skeleton loading states for all dashboard routes

Co-Authored-By: Neuridion"
```

---

### Task 3: Toast System

**Files:**
- Create: `app/components/ui/Toast.tsx`
- Create: `app/components/ui/ToastProvider.tsx`
- Modify: `app/dashboard/dashboard-client-shell.tsx`

- [ ] **Step 1: Create Toast component**

Create `app/components/ui/Toast.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-green-700 text-white',
  error:   'bg-red-700 text-white',
  warning: 'bg-amber-600 text-white',
  info:    'bg-zinc-800 text-white',
}

const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
  success: 4000,
  error:   null,
  warning: 6000,
  info:    4000,
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(0, 3).map((t) => (
        <ToastNotification key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastNotification({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const ms = AUTO_DISMISS_MS[toast.type]
    if (ms) {
      const id = setTimeout(() => onDismiss(toast.id), ms)
      return () => clearTimeout(id)
    }
  }, [toast.id, toast.type, onDismiss])

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-md px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-3 max-w-sm pointer-events-auto transition-all duration-200',
        STYLES[toast.type],
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create ToastProvider context**

Create `app/components/ui/ToastProvider.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { ToastContainer, type ToastType, type ToastItem } from './Toast'

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
  dismiss: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts((prev) => [...prev.slice(-2), { id, message, type }])
  }, [])

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
```

- [ ] **Step 3: Wrap DashboardClientShell with ToastProvider**

Modify `app/dashboard/dashboard-client-shell.tsx`:

Add import at top:
```tsx
import { ToastProvider } from '@/app/components/ui/ToastProvider'
```

Wrap the outermost return inside the `<SearchProvider>` — add `<ToastProvider>` around the `<div className="flex h-screen ...">`:

```tsx
export function DashboardClientShell({ userRole, children }: Props) {
  return (
    <LanguageProvider>
      <SearchProvider>
        <ToastProvider>
          <div className="flex h-screen bg-slate-50">
            {/* ... existing content unchanged ... */}
          </div>

          <SearchStatusWidget />
        </ToastProvider>
      </SearchProvider>
    </LanguageProvider>
  )
}
```

> **Important:** The `<ToastProvider>` must wrap the main layout AND the `<SearchStatusWidget>` so both the toast container and the widget render at the correct z-index.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add app/components/ui/Toast.tsx app/components/ui/ToastProvider.tsx app/dashboard/dashboard-client-shell.tsx
git commit -m "feat: add global toast notification system

Co-Authored-By: Neuridion"
```

---

### Task 4: Error Message Cleanup

**Files:**
- Modify: `app/dashboard/settings/settings-client.tsx`
- Modify: `app/dashboard/archive/archive-actions.tsx`
- Modify: `app/dashboard/billing/billing-actions.tsx`
- Modify: `app/login/sign-in-page.tsx`

This task replaces raw error strings with the toast system (for dashboard pages) and friendly messages (for login).

- [ ] **Step 1: Clean up settings-client.tsx**

In `app/dashboard/settings/settings-client.tsx`:

Add import at top:
```tsx
import { useToast } from '@/app/components/ui/ToastProvider'
```

Inside the `SettingsClient` component, add:
```tsx
const toast = useToast()
```

Replace `saveInfo` function body — change the `setInfoMsg` line:
```tsx
// OLD:
setInfoMsg(error ? `Error: ${error.message}` : 'Saved.')
// NEW:
if (error) {
  toast.show('Unable to save changes. Please try again.', 'error')
} else {
  toast.show('Changes saved.', 'success')
}
setInfoMsg('')
```

Replace `changePassword` error handling — change:
```tsx
// OLD:
setPwMsg(`Error: ${error.message}`)
// NEW:
toast.show('Unable to update password. Please try again.', 'error')
setPwMsg('')
```

And change the success:
```tsx
// OLD:
setPwMsg('Password updated.')
// NEW:
toast.show('Password updated.', 'success')
setPwMsg('')
```

Replace consent error — change:
```tsx
// OLD:
setConsentMsg(json.error ?? 'Something went wrong')
// NEW:
toast.show('Unable to update consent. Please try again.', 'error')
setConsentMsg('')
```

And consent success:
```tsx
// OLD after setCookiesConsented(false):
setConsentMsg('Cookie consent withdrawn.')
// NEW:
toast.show('Cookie consent withdrawn.', 'success')
setConsentMsg('')
```

Replace delete error — change all `setDeleteMsg(json.error)` to:
```tsx
toast.show('Unable to process request. Please try again.', 'error')
```

> **Keep the inline `infoMsg` and `pwMsg` JSX renders** for now — they'll show empty strings and render nothing. Removing the JSX is optional cleanup. The important thing is errors flow through toast.

- [ ] **Step 2: Clean up archive-actions.tsx**

In `app/dashboard/archive/archive-actions.tsx`:

The `onToast` callback prop already exists and is called by the parent. Add the `useToast` import and use it inside the `DownloadButton` component which uses `alert()`:

Add import:
```tsx
import { useToast } from '@/app/components/ui/ToastProvider'
```

In `DownloadButton`, add `const toast = useToast()` and replace:
```tsx
// OLD:
alert('Download failed — try again.')
// NEW:
toast.show('Download failed — please try again.', 'error')
```

- [ ] **Step 3: Clean up billing-actions.tsx**

In `app/dashboard/billing/billing-actions.tsx`:

Add import:
```tsx
import { useToast } from '@/app/components/ui/ToastProvider'
```

Inside `BillingActions`, add `const toast = useToast()` and replace:
```tsx
// OLD:
setError(String(err))
// NEW:
const msg = err instanceof Error && err.message.includes('429')
  ? 'Too many requests — please wait a moment.'
  : 'Unable to connect to billing. Please try again.'
toast.show(msg, 'error')
setError(null)
```

- [ ] **Step 4: Clean up login error messages**

In `app/login/sign-in-page.tsx`:

> **Note:** Login page is NOT inside the dashboard shell, so no ToastProvider. Instead, just improve the inline error messages.

Replace the generic error strings with friendly ones:
```tsx
// In handleEmailSubmit catch:
// OLD:
setError('Network error. Please try again.')
// NEW:
setError('Unable to connect. Please check your internet and try again.')

// In verifyCode:
// OLD:
setError(data.error ?? 'Verification failed.')
// NEW:
setError(data.error === 'Invalid token' ? 'Incorrect code. Please check and try again.' : data.error ?? 'Verification failed. Please try again.')
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/settings/settings-client.tsx app/dashboard/archive/archive-actions.tsx app/dashboard/billing/billing-actions.tsx app/login/sign-in-page.tsx
git commit -m "fix: replace raw error strings with toast notifications

Co-Authored-By: Neuridion"
```

---

### Task 5: Rate Limit Feedback (429 Toast)

**Files:**
- Modify: `app/dashboard/search/search-panel.tsx`

The search panel already has inline `showToast` function. Instead of creating a separate `fetchWithToast` wrapper (YAGNI — most fetch calls are in components that already handle errors), add 429 detection to the two main fetch flows in search-panel.

- [ ] **Step 1: Add 429 handling to search-panel**

In `app/dashboard/search/search-panel.tsx`, the `runSearch` function already checks `res.status`. Add 429:

After the 524/504/408 check block (around line 622):
```tsx
if (res.status === 429) {
  setState({ phase: 'error', message: 'Too many requests — please wait a moment and try again.' })
  return
}
```

In `saveDraft`, add 429 handling after `const res = await fetch(...)`:
```tsx
if (!res.ok) {
  if (res.status === 429) { showToast('Too many requests — please wait a moment.', 'error'); return }
  throw new Error(data.error ?? 'Save failed')
}
```

In `generateReport`, add 429 handling:
```tsx
if (!res.ok) {
  if (res.status === 429) { setReportState({ phase: 'error', message: 'Too many requests — please wait a moment.' }); return }
  setReportState({ phase: 'error', message: data.error ?? 'Report generation failed.' })
  return
}
```

- [ ] **Step 2: Add 429 handling to archive-actions.tsx**

In `app/dashboard/archive/archive-actions.tsx`, in `CancelRunButton.handleClick` and `DeleteRunButton.handleDelete`, add before the `throw`:
```tsx
if (res.status === 429) { onToast('Too many requests — please wait a moment.', 'error'); setState('idle'); return }
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/search/search-panel.tsx app/dashboard/archive/archive-actions.tsx
git commit -m "feat: add user-facing 429 rate limit feedback

Co-Authored-By: Neuridion"
```

---

### Task 6: Feature Discovery Tooltips

**Files:**
- Install: `@radix-ui/react-tooltip`
- Create: `app/components/ui/InfoTooltip.tsx`
- Modify: `app/dashboard/search/search-panel.tsx` (3 tooltips)
- Modify: `app/dashboard/profiles/[id]/edit/edit-form.tsx` (1 tooltip)

- [ ] **Step 1: Install Radix Tooltip**

```bash
npm install @radix-ui/react-tooltip
```

- [ ] **Step 2: Create InfoTooltip component**

Create `app/components/ui/InfoTooltip.tsx`:

```tsx
'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { HelpCircle } from 'lucide-react'

export function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className="inline-flex items-center text-zinc-400 hover:text-zinc-600 transition-colors align-middle ml-1" aria-label="More info">
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-xs rounded-md bg-zinc-900 px-3 py-2 text-xs text-white leading-relaxed shadow-lg animate-in fade-in-0 zoom-in-95"
          >
            {text}
            <Tooltip.Arrow className="fill-zinc-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
```

- [ ] **Step 3: Add tooltips to search panel**

In `app/dashboard/search/search-panel.tsx`:

Add import:
```tsx
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'
```

**Tooltip 1 — Databases section heading** (around line 682):
```tsx
// OLD:
<h2 className="text-xl font-semibold text-[#0F1F3D]">
  {t.search.databases} ({selectedDbs.size} {t.search.selected}) <span className="text-red-500">*</span>
</h2>
// NEW:
<h2 className="text-xl font-semibold text-[#0F1F3D]">
  {t.search.databases} ({selectedDbs.size} {t.search.selected}) <span className="text-red-500">*</span>
  <InfoTooltip text="Select which regulatory databases to search. BfArM (Germany), MHRA (UK), FDA MAUDE (USA), Swissmedic (Switzerland). Inactive databases are coming soon." />
</h2>
```

**Tooltip 2 — Generic search terms heading** (around line 743):
```tsx
// OLD:
<h2 className="text-xl font-semibold text-[#0F1F3D] mb-2">{t.search.genericTerms}</h2>
// NEW:
<h2 className="text-xl font-semibold text-[#0F1F3D] mb-2">
  {t.search.genericTerms}
  <InfoTooltip text="Enter keywords to narrow the search. Use OR between synonyms and AND for required terms. Wrap exact phrases in quotes." />
</h2>
```

**Tooltip 3 — Manufacturer terms heading** (around line 762):
```tsx
// OLD:
<h2 className="text-xl font-semibold text-[#0F1F3D] mb-2">{t.search.manufacturerTerms}</h2>
// NEW:
<h2 className="text-xl font-semibold text-[#0F1F3D] mb-2">
  {t.search.manufacturerTerms}
  <InfoTooltip text="Manufacturer name variants used to filter results. Include trade names, legal entity variations, and abbreviations. Auto-extracted from your profile if left blank." />
</h2>
```

- [ ] **Step 4: Add tooltip to edit-form.tsx**

In `app/dashboard/profiles/[id]/edit/edit-form.tsx`:

Add import:
```tsx
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'
```

On the EMDN code label (around line 84):
```tsx
// OLD:
<label htmlFor="emdn_code" className="block text-sm font-medium text-zinc-700 mb-1.5">
  EMDN code
</label>
// NEW:
<label htmlFor="emdn_code" className="block text-sm font-medium text-zinc-700 mb-1.5">
  EMDN code
  <InfoTooltip text="European Medical Device Nomenclature — a standardised code classifying your device type (e.g. Z12030101). Find yours in the EUDAMED database." />
</label>
```

On the intended use label (around line 107):
```tsx
// OLD:
<label htmlFor="intended_use" className="block text-sm font-medium text-zinc-700 mb-1.5">
  Intended use
</label>
// NEW:
<label htmlFor="intended_use" className="block text-sm font-medium text-zinc-700 mb-1.5">
  Intended use
  <InfoTooltip text="Describe your device's intended purpose as stated in your technical documentation. Used by the AI to assess FSN relevance to your device." />
</label>
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add app/components/ui/InfoTooltip.tsx app/dashboard/search/search-panel.tsx app/dashboard/profiles/\[id\]/edit/edit-form.tsx package.json package-lock.json
git commit -m "feat: add feature discovery tooltips with Radix Tooltip

Co-Authored-By: Neuridion"
```

---

### Task 7: Quota Visibility

**Files:**
- Create: `app/components/ui/QuotaBar.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/dashboard-client-shell.tsx`
- Modify: `app/dashboard/sidebar-nav.tsx`

- [ ] **Step 1: Create QuotaBar component**

Create `app/components/ui/QuotaBar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { clsx } from 'clsx'
import { InfoTooltip } from './InfoTooltip'

interface QuotaBarProps {
  searchesUsed: number
  searchesMax: number
  profilesUsed: number
  profilesMax: number
}

function Bar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1
  const pct = unlimited ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100))
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-teal-500'

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{unlimited ? `${used} / ∞` : `${used} / ${max}`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: unlimited ? '0%' : `${pct}%` }} />
      </div>
    </div>
  )
}

export function QuotaBar({ searchesUsed, searchesMax, profilesUsed, profilesMax }: QuotaBarProps) {
  const atLimit = (searchesMax !== -1 && searchesUsed >= searchesMax) || (profilesMax !== -1 && profilesUsed >= profilesMax)

  return (
    <div className="px-4 py-3 border-t border-zinc-200 space-y-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-600">Plan usage</span>
        <InfoTooltip text="Your current plan limits. Searches reset monthly. Upgrade for higher limits." />
      </div>
      <Bar used={searchesUsed} max={searchesMax} label="Searches" />
      <Bar used={profilesUsed} max={profilesMax} label="Profiles" />
      {atLimit && (
        <Link href="/dashboard/billing" className="block text-xs text-teal-600 hover:underline font-medium">
          Upgrade plan →
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update layout.tsx to fetch quota counts**

In `app/dashboard/layout.tsx`, add queries for search run count (this month) and profile count:

```tsx
import { redirect } from 'next/navigation'
import { DashboardClientShell } from './dashboard-client-shell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS, planFromPriceId } from '@/lib/plans'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('role, plan, stripe_price_id')
    .eq('id', user.id)
    .single()
  const userRole = data?.role ?? null
  const plan = PLANS[data?.plan as keyof typeof PLANS] ?? PLANS.free

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [searchCount, profileCount] = await Promise.all([
    admin.from('search_runs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', monthStart.toISOString()),
    admin.from('product_profiles').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const quota = {
    searchesUsed: searchCount.count ?? 0,
    searchesMax: plan.maxSearchRuns,
    profilesUsed: profileCount.count ?? 0,
    profilesMax: plan.maxProfiles,
  }

  return (
    <DashboardClientShell userRole={userRole} quota={quota}>
      {children}
    </DashboardClientShell>
  )
}
```

- [ ] **Step 3: Update DashboardClientShell to accept and pass quota**

In `app/dashboard/dashboard-client-shell.tsx`:

Update the Props interface:
```tsx
interface Props {
  userRole: string | null
  quota: {
    searchesUsed: number
    searchesMax: number
    profilesUsed: number
    profilesMax: number
  }
  children: React.ReactNode
}
```

Update the function signature:
```tsx
export function DashboardClientShell({ userRole, quota, children }: Props) {
```

Pass quota to SidebarNav:
```tsx
<SidebarNav userRole={userRole} quota={quota} />
```

- [ ] **Step 4: Update SidebarNav to show QuotaBar**

In `app/dashboard/sidebar-nav.tsx`:

Add import:
```tsx
import { QuotaBar } from '@/app/components/ui/QuotaBar'
```

Update the component props:
```tsx
interface SidebarNavProps {
  userRole: string | null
  quota: {
    searchesUsed: number
    searchesMax: number
    profilesUsed: number
    profilesMax: number
  }
}

export function SidebarNav({ userRole, quota }: SidebarNavProps) {
```

Add `<QuotaBar>` between the nav links and the bottom section. Insert before the `<div className="border-t border-[#E2E8F0] pt-4 space-y-1">`:
```tsx
      </ul>

      <div className="mt-auto">
        <QuotaBar
          searchesUsed={quota.searchesUsed}
          searchesMax={quota.searchesMax}
          profilesUsed={quota.profilesUsed}
          profilesMax={quota.profilesMax}
        />

        <div className="border-t border-[#E2E8F0] pt-4 pb-2 space-y-1 px-0">
```

> **Note:** The exact placement depends on the existing layout. The goal: quota bars show between the nav links and the logout/admin section at the bottom.

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add app/components/ui/QuotaBar.tsx app/dashboard/layout.tsx app/dashboard/dashboard-client-shell.tsx app/dashboard/sidebar-nav.tsx
git commit -m "feat: add plan quota visibility in sidebar

Co-Authored-By: Neuridion"
```

---

### Task 8: Replace Remaining Loader2 Spinners

**Files:**
- Modify: `app/dashboard/search/search-panel.tsx` — Remove inline `Toast` component (replaced by global toast system), replace action-button spinners with text states
- Modify: `app/dashboard/search-status-widget.tsx` — Replace Loader2 with a subtle animated dot

> **Note:** The Loader2 icons used in the search progress card (lines 314, 338, 351) should STAY — they indicate active database scanning and are contextually correct (not a page-level loading state). Only the action-button spinners and the inline Toast get replaced.

- [ ] **Step 1: Remove inline Toast from search-panel.tsx**

In `app/dashboard/search/search-panel.tsx`:

Delete the inline `Toast` component (lines ~197–206):
```tsx
// DELETE THIS ENTIRE BLOCK:
function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={clsx(
      'fixed bottom-6 right-6 z-50 rounded px-4 py-3 text-sm font-medium shadow-lg pointer-events-none',
      type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
    )}>
      {msg}
    </div>
  )
}
```

Replace the `showToast` function and `toast` state with the global toast:

Add import:
```tsx
import { useToast } from '@/app/components/ui/ToastProvider'
```

Inside `SearchPanel`, replace:
```tsx
// DELETE:
const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

// DELETE:
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  setToast({ msg, type })
  setTimeout(() => setToast(null), 3000)
}

// ADD:
const { show: showToast } = useToast()
```

Delete the toast JSX at the bottom of the component (line ~1038):
```tsx
// DELETE:
{toast && <Toast msg={toast.msg} type={toast.type} />}
```

- [ ] **Step 2: Replace edit-form.tsx Loader2**

In `app/dashboard/profiles/[id]/edit/edit-form.tsx`, the Loader2 is used in the save button (line 123). Replace with text-only:

Remove the Loader2 import:
```tsx
// OLD:
import { Loader2 } from 'lucide-react'
// DELETE this import
```

Replace the button content:
```tsx
// OLD:
{saving && <Loader2 className="w-4 h-4 animate-spin" />}
{saving ? 'Saving…' : 'Save changes'}
// NEW:
{saving ? 'Saving…' : 'Save changes'}
```

- [ ] **Step 3: Replace search-status-widget.tsx Loader2**

In `app/dashboard/search-status-widget.tsx`, the Loader2 spinner (line 57) can be replaced with a pulsing dot:

Remove `Loader2` from the import:
```tsx
// OLD:
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
// NEW:
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
```

Replace the running state icon (line 57):
```tsx
// OLD:
<Loader2 className="w-4 h-4 animate-spin text-blue-500 mt-0.5 shrink-0" />
// NEW:
<span className="relative flex h-4 w-4 mt-0.5 shrink-0 items-center justify-center">
  <span className="animate-ping absolute h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75" />
  <span className="relative h-2 w-2 rounded-full bg-blue-500" />
</span>
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/search/search-panel.tsx app/dashboard/profiles/\[id\]/edit/edit-form.tsx app/dashboard/search-status-widget.tsx
git commit -m "refactor: replace Loader2 spinners with text states and global toast

Co-Authored-By: Neuridion"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev` and open `http://localhost:3000/dashboard/search` in browser.

Check:
- Skeleton loading states appear briefly on navigation
- Tooltips show on hover for EMDN code, databases, search terms, intended use
- Quota bars appear in sidebar with correct counts
- Toast notifications appear when errors occur
- No Loader2 spinners remain on action buttons (save draft, save profile)
- Search progress card still shows Loader2 (intentionally kept)

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Update PROGRESS.md**

Mark completed items in `PROGRESS.md`:
```
## UX Overhaul
- [x] Skeleton loaders (replace 12 Loader2 spinners)
- [x] Error message cleanup (global toast system)
- [x] Rate limit feedback (user-facing 429 toast)
- [x] Feature discovery tooltips (Radix Tooltip)
- [x] Quota visibility in dashboard sidebar
- [ ] Server-side caching (unstable_cache + revalidateTag)
- [ ] Optimistic rendering (useOptimistic + Server Actions)
```

> **Note:** Tasks 6 (server-side caching) and 7 (optimistic rendering) from the spec are NOT included in this plan. They require:
> - Context7 verification of the `unstable_cache` API in Next.js 16
> - Server Action conversion of multiple mutation flows
> - These are best planned separately after the foundation (skeletons, toast, tooltips) ships and is tested.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Pillar 1 (Skeletons): Tasks 1, 2, 8
- ✅ Pillar 2 (Toast/Errors): Tasks 3, 4
- ✅ Pillar 3 (Rate limit feedback): Task 5
- ✅ Pillar 4 (Tooltips): Task 6
- ✅ Pillar 5 (Quota visibility): Task 7
- ⏸ Pillar 6 (Caching): Deferred — requires context7 API verification
- ⏸ Pillar 7 (Optimistic): Deferred — requires Server Action conversion
- ✅ Pillar 8 (Streaming): Correctly skipped

**Placeholder scan:** No TBD, TODO, or "implement later" found.

**Type consistency:** `ToastType`, `ToastItem`, `useToast`, `InfoTooltip`, `Skeleton`, `QuotaBar` — all referenced consistently across tasks.
