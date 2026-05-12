# Magic-Link Claim Flow Design

## Goal

Eliminate plaintext password exposure in the QR code trial claim flow. Replace with OTP email verification using existing Supabase OTP infrastructure.

## Current Problem

The claim API (`/api/claim/[code]`) creates a user with a random temp password and returns it in the JSON response. The frontend displays this password to the user and auto-signs them in. The password travels:
1. In the HTTP response body
2. Into React state in the browser
3. Into another HTTP request for sign-in

This is a security risk — the password is exposed in network logs, browser memory, and potentially in error tracking.

## Solution

After creating the user, send an OTP code to their email via Supabase `signInWithOtp`. The frontend shows an OTP verification form. User enters the 6-digit code from their email, which verifies and creates a session — no password ever leaves the server.

## Changes

### 1. API route (`app/api/claim/[code]/route.ts`)

- Remove `generateTempPassword()` function and `randomBytes` import
- Still create user via admin API (with a random password internally — Supabase requires one, but it's never exposed)
- After user creation + claim bookkeeping, call `signInWithOtp({ email, options: { shouldCreateUser: false } })` via server-side Supabase client
- Return `{ ok: true, email }` — no password field

### 2. Frontend (`app/claim/[code]/ClaimForm.tsx`)

- After successful claim, show OTP code input field instead of password display
- On OTP submit, call `/api/auth/otp` with `{ action: 'verify', email, code }` (reuse existing endpoint)
- On verify success, redirect to `/dashboard/search?welcome=trial`
- Remove `password` state, remove `signInWithPassword` logic

### 3. No changes needed

- `/api/auth/otp` endpoint already handles verify with `shouldCreateUser: false`
- No database changes
- No new dependencies

## Testing

- TypeScript check passes
- Manual: claim a test code → email arrives with OTP → enter code → lands on dashboard
