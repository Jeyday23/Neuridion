# Redis Rate Limiter Design

## Goal

Replace the in-memory sliding-window rate limiter (`lib/rate-limit.ts`) with Upstash Redis so rate limits survive deploys, are shared across serverless instances, and cannot be bypassed by hitting different cold starts.

## Architecture

The `rateLimit()` function currently uses a process-local `Map<string, number[]>`. In a serverless environment (Vercel), each cold start gets a fresh Map — an attacker can spray requests across instances to bypass limits entirely.

Replace the in-memory implementation with `@upstash/ratelimit` backed by `@upstash/redis`. Keep the exact same function signatures so all 12 consumer files need zero changes.

## Components

### 1. Upstash Redis client (`lib/upstash.ts`)

Single shared Redis instance created from `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars. Returns `null` if either env var is missing (local dev fallback).

### 2. Rewritten `rateLimit()` in `lib/rate-limit.ts`

- If Redis client is available: use `@upstash/ratelimit` with sliding window algorithm
- If Redis client is null (missing env vars): fall back to the existing in-memory Map implementation
- Same signature: `rateLimit(key, maxRequests, windowMs) → { allowed, retryAfterMs }`
- The Upstash `slidingWindow` limiter is created per unique (maxRequests, windowMs) pair and cached

### 3. Unchanged functions

- `checkLoginRateLimit(ip)` — stays Supabase-based (login_attempts table). Not changing this.
- `recordLoginAttempt(ip, email, success)` — stays Supabase-based.
- `getClientIp(request)` — no change needed.

### 4. Environment variables

- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST endpoint
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST token

Both optional. When missing, falls back to in-memory.

## What does NOT change

- No API route files change — all 12 consumers keep calling `rateLimit(key, max, window)` with the same interface
- `checkLoginRateLimit` and `recordLoginAttempt` stay Supabase-based
- `getClientIp` stays as-is
- No new database migrations

## Testing

- Unit test: verify `rateLimit()` returns `{ allowed: true, retryAfterMs: 0 }` on first call
- Unit test: verify `rateLimit()` returns `{ allowed: false }` after maxRequests calls with same key
- TypeScript check passes
