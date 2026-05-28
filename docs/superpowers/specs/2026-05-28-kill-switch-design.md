# Neuridion Kill Switch — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** Kill switch only (no new rate limiting, CSRF, or other security changes)

## Problem

Neuridion has no way to take the entire application offline for maintenance without a redeploy or infrastructure change. If an incident requires immediate shutdown, there's no fast toggle.

## Solution

Environment variable `MAINTENANCE_MODE=true` checked at the very top of `proxy()` in `proxy.ts`, before any Redis, CSRF, session, or auth logic runs.

## Behavior When Active

| Request Type | Response |
|---|---|
| `/api/*` routes | `503 JSON` — `{ "error": "Service temporarily unavailable" }` with `Retry-After: 300` |
| All other routes | `503 HTML` — minimal static page: "We'll be right back. Neuridion is undergoing scheduled maintenance." |

## What It Does NOT Touch

- No changes to Redis rate limiting (Upstash sliding window, 120 req/min)
- No changes to CSRF protection (custom header + origin validation)
- No changes to CSP nonce generation or security headers
- No changes to session management (HMAC-signed cookies, 8hr absolute + 30min idle)
- No new dependencies

## Implementation

- Static HTML template constant (`MAINTENANCE_PAGE`) added above `proxy()` function
- First check inside `proxy()`: if `MAINTENANCE_MODE === 'true'`, return 503 immediately
- API routes get JSON response; all other routes get HTML response
- Both include `Retry-After: 300` header

## Activation

Set `MAINTENANCE_MODE=true` in hosting environment (Render/Vercel). To deactivate, remove or set to `false`. Instant effect if using runtime env vars (no redeploy needed).

## Pattern

Identical to the kill switch already live in Kodex Leads (`kodex-leads/proxy.ts`), adapted to Neuridion's existing proxy structure.
