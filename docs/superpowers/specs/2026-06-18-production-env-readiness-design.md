# Production Environment Readiness Design

## Goal

Make Neuridion fail fast and clearly when production deployment configuration is incomplete, while keeping local development lightweight.

This is the first release-readiness slice. It does not change scraper logic, AI classification, billing behavior, or UI flows. It creates a trustworthy deployment gate so later validation work runs against a correctly configured app.

## Deployment Source Of Truth

Render is the current production deployment target. The implementation should treat `render.yaml` and the Render env group `neuridion-env` as the operational source of truth.

The checks should remain platform-neutral at the code level: a future Vercel, Docker, or CI deployment should be able to run the same verification command without Render-specific SDKs or APIs.

## Current Problem

The app already has runtime protection in `instrumentation.ts`, and production build succeeds. However, local production start failed with HTTP 500 because required production secrets were absent:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `AUDIT_HMAC_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The build also emitted repeated audit warnings when `AUDIT_HMAC_KEY` was not present. The current behavior catches missing configuration late and noisily. A senior release process should catch this with a deliberate verification command before deploy.

## Proposed Approach

Create a two-tier production-readiness subsystem:

1. A canonical env manifest that classifies variables as required, recommended, optional, or forbidden in production.
2. A fast static verification script exposed through `npm run verify:env`.
3. An explicit integration verification script exposed through `npm run verify:integrations`.
4. A release gate exposed through `npm run verify:release` that runs static checks, integration checks, tests, and build.
5. A Render-focused deployment checklist documenting exactly what must exist in `neuridion-env`.
6. CI/build integration that can run static verification without requiring local development secrets, and a pre-deploy/release path that intentionally verifies real external services.

This keeps the existing runtime guard in `instrumentation.ts`, but moves the first failure point earlier into an explicit release gate.

## Env Categories

### Required In Production

These must be present and non-placeholder for production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `AUDIT_HMAC_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `WORKER_API_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Required For Paid Billing

These should be required when billing is enabled:

- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_ENTERPRISE`
- `NEXT_PUBLIC_STRIPE_PRICE_STARTER`
- `NEXT_PUBLIC_STRIPE_PRICE_PRO`

The public Stripe price IDs must match the corresponding server-side price IDs for plans that are shown in the UI.

### Recommended In Production

Missing values should warn, not fail:

- `RESEND_API_KEY`
- `RESEND_FROM_ADDRESS`
- `SECURITY_ALERT_EMAIL`
- `OPENFDA_API_KEY`
- `FIRECRAWL_API_KEY`
- `PDFSHIFT_API_KEY`

### Optional Operational Controls

These may be absent:

- `MAINTENANCE_MODE`
- `ALLOWED_ORIGINS`
- `MAX_FILTER_ITEMS_PER_RUN`
- `BFARM_PRIMARY_TIMEOUT_MS`
- `BFARM_SOURCE_BUDGET_MS`
- `MHRA_EXCEL_URL`

### Forbidden In Production

These must fail verification if set in production:

- `ENABLE_DEV_WORKER_BYPASS`
- `SKIP_AI_FILTER`

## Placeholder Detection

The static verifier should reject exact known placeholders and unsafe production patterns without using broad substring matches that could reject legitimate domains or company names.

Reject:

- Empty strings
- Values equal to the placeholders in `.env.example`
- Values containing `REPLACE_ME`
- Values beginning with `your-` when the example uses that prefix
- `localhost` for `NEXT_PUBLIC_SITE_URL` in production
- Non-HTTPS `NEXT_PUBLIC_SITE_URL` in production
- Test Stripe keys (`sk_test_`, `pk_test_`) when `NODE_ENV=production`

Do not reject a value merely because the substring `example` appears inside a legitimate hostname or organization name.

The verifier should not print secret values. It should print variable names and short remediation text only.

## Commands

### Static Env Verification

Add:

```bash
npm run verify:env
```

Default behavior:

- Treats `NODE_ENV=production` as production mode.
- Treats `RENDER=true` or `RENDER_SERVICE_ID` as production-like when present.
- Accepts an explicit `--mode production` flag for CI and manual release checks.
- Accepts `--mode development` for local diagnostics.

Expected output on success:

```text
Environment verification passed for production.
Required: 15 checked
Recommended: 6 checked, 0 missing
Forbidden: 2 checked
```

Expected output on failure:

```text
Environment verification failed for production.
Missing required:
- AUDIT_HMAC_KEY: generate with `openssl rand -hex 32`
Placeholder required:
- NEXT_PUBLIC_SITE_URL: must be the deployed HTTPS origin
Forbidden:
- ENABLE_DEV_WORKER_BYPASS: remove this from production
```

### Integration Verification

Add:

```bash
npm run verify:integrations
```

Default behavior:

- Does not run as part of ordinary local development.
- Requires explicit `--mode production` or production-like environment detection.
- Performs real external calls using the configured credentials.
- Prints service names and sanitized failure reasons only.
- Exits with code `1` when any required integration check fails.

The integration verifier should check:

- **Supabase auth and database access:** create a service-role Supabase client and run low-impact `select(...).limit(1)` sentinel queries against core public tables used by the app, including `users`, `profiles`, `search_runs`, `fsn_results`, `filter_decisions`, `filter_decision_cache`, `reports`, and `search_drafts`.
- **Database schema readiness:** verify expected columns exist through the same sentinel selects. Do not rely on a `_migrations` table unless the project explicitly exposes one through Supabase/PostgREST.
- **Upstash Redis:** instantiate the Redis REST client and run a low-impact read/write/delete probe under a namespaced key such as `verify:integrations:<timestamp>`.
- **Stripe secret key:** instantiate Stripe and retrieve the configured price IDs for starter, pro, and enterprise when present.
- **Stripe public/server price consistency:** verify `NEXT_PUBLIC_STRIPE_PRICE_STARTER === STRIPE_PRICE_STARTER` and `NEXT_PUBLIC_STRIPE_PRICE_PRO === STRIPE_PRICE_PRO` when those plans are shown in the UI.
- **Stripe price status:** fail if a required price ID is missing, not retrievable, inactive, or not a recurring price.
- **QStash/worker configuration:** verify QStash token/signing keys are present statically, and verify `WORKER_API_SECRET` is long enough for production use. Avoid enqueueing a real search job in this slice.
- **Anthropic key:** prefer token counting because it is the smallest authenticated SDK call available in the installed `@anthropic-ai/sdk` version:

```ts
await client.messages.countTokens({
  model: 'claude-3-5-sonnet-20241022',
  messages: [],
})
```

If `messages.countTokens` is unavailable in a future SDK shape, fall back to:

```ts
await client.models.list()
```

Note: sentinel database queries verify that core tables are present and accessible through the configured Supabase service role, but they do not replace the deployment migration pipeline. Production deployments must still apply Supabase migrations explicitly before release.

Expected output on success:

```text
Integration verification passed for production.
Supabase: passed
Database schema: passed
Redis: passed
Stripe: passed
Anthropic: passed
Worker/QStash config: passed
```

Expected output on failure:

```text
Integration verification failed for production.
Anthropic: failed - invalid API key
Stripe: failed - STRIPE_PRICE_STARTER is not an active recurring price
Database schema: failed - search_runs sentinel query failed
```

### Release Verification

Add:

```bash
npm run verify:release
```

This command should run:

```bash
npm run verify:env -- --mode production
npm run verify:integrations -- --mode production
npm run lint
npx vitest run
npm run build
```

The command may be a small Node script rather than a shell-only command so output can be grouped cleanly and work cross-platform.

## CI Integration Strategy

- `npm run verify:env` runs in every CI/build path because it is fast and does not call external services.
- `npm run verify:integrations -- --mode production` runs only in an explicit pre-deploy pipeline with production secrets available.
- `npm run verify:release` is the final pre-deploy gate and should be human-triggered or restricted to the protected production deployment workflow.
- Local development normally runs `npm run verify:env`; developers should not need production credentials for ordinary commits.
- Render build should run `npm run verify:env -- --mode production && npm run build`.

## Render Checklist

Add a deployment checklist document covering:

- Render service uses `render.yaml`.
- Env group name is `neuridion-env`.
- Exact required variables.
- Secret generation commands:

```bash
openssl rand -hex 32
```

- How to verify after setting env:

```bash
npm run verify:env -- --mode production
npm run verify:integrations -- --mode production
npm run verify:release
npm run build
npm start
```

- Expected health checks:
  - `/`
  - `/api/worker/health`
  - `/api/worker/scraper-health`

## Error Handling

The static verifier and integration verifier should exit with code `1` on production failures and code `0` on success.

Warnings for recommended variables should not fail unless a `--strict-recommended` flag is provided.

The static verifier should avoid importing the Next app or initializing SDK clients. It should read `process.env` only so it can run quickly in CI, Render build hooks, and local shells.

The integration verifier may import SDK packages directly, but should not import app route handlers or modules with broad side effects. It should use small, purpose-built verification helpers.

## Testing

Add unit tests for the static env verification logic:

- Passes with all production-required variables present.
- Fails when a required variable is missing.
- Fails when a required variable contains a placeholder.
- Fails when `ENABLE_DEV_WORKER_BYPASS` is set in production.
- Fails on Stripe test keys in production.
- Warns, but does not fail, when recommended variables are missing.
- Does not leak secret values in messages.
- Does not reject a legitimate hostname containing the substring `example`.

Add unit tests for integration verification orchestration with mocked SDK clients:

- Use Vitest module-level mocks (`vi.mock`) for SDK packages and dependency factories instead of real network calls.
- Reports Supabase/database schema failures without leaking credentials.
- Reports Redis probe failures.
- Reports Stripe missing/inactive/non-recurring price failures.
- Reports Stripe public/server price ID mismatch.
- Reports Anthropic authentication failure.
- Aggregates multiple failures into one exit report.

Example mock shape:

```ts
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      countTokens: vi.fn(() => Promise.resolve({ input_tokens: 0 })),
    },
    models: {
      list: vi.fn(() => Promise.resolve({ data: [] })),
    },
  })),
}))
```

Use equivalent `vi.mock` module factories for `stripe`, `@upstash/redis`, and `@supabase/supabase-js`.

## Success Criteria

This slice is complete when:

- `npm run verify:env -- --mode production` exists.
- `npm run verify:integrations -- --mode production` exists.
- `npm run verify:release` exists.
- Tests cover missing, placeholder, forbidden, and warning cases.
- Tests cover integration failure aggregation with mocked clients.
- Render deployment docs list all production env requirements.
- Production build still passes.
- Existing app tests still pass.
- The runtime guard in `instrumentation.ts` remains as a final safety net.

## Out Of Scope

This slice does not include:

- Fetching secrets from Render automatically.
- Rotating secrets.
- Changing Supabase, Stripe, Upstash, QStash, Anthropic, Resend, Firecrawl, or PDFShift integrations.
- Enqueueing real QStash jobs or running real searches during verification.
- Accuracy validation for scraper/filter results.
- Frontend UX changes.
