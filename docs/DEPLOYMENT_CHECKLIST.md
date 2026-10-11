# Neuridion Deployment Checklist

## Render Service

- Service: `neuridion-web`
- Runtime: Node
- Build command: `npm install && npm run verify:env -- --mode production && npm run build`
- Start command: `npm start`
- Env group: `neuridion-env`

## Required Production Env

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENFDA_API_KEY`
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
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_ENTERPRISE`
- `NEXT_PUBLIC_STRIPE_PRICE_STARTER`
- `NEXT_PUBLIC_STRIPE_PRICE_PRO`

## Secret Generation

Generate these with:

```bash
openssl rand -hex 32
```

- `AUDIT_HMAC_KEY`
- `WORKER_API_SECRET`

## Pre-Deploy Verification

### Apply database migrations

Run the GitHub Actions workflow `Production Database Migrations` manually from
`main` with confirmation `APPLY_PRODUCTION_MIGRATIONS`. The workflow is bound to
the `production` GitHub Environment and requires:

- Repository variable: `SUPABASE_PROJECT_REF`
- Environment secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`

It lists remote migration state, performs `supabase db push --dry-run`, applies
pending migrations, and lists the final state. Do not apply production schema
changes directly in the Supabase SQL editor; that bypasses migration history.

Production contains legacy timestamped migration-history entries whose original
SQL is not in this repository. The workflow records those identifiers from
`supabase/legacy-remote-migrations.txt` as ephemeral no-op placeholders and
temporarily defers local migrations 023-067. This allows the evidence rollout to
apply the evidence and release-integrity migrations without replaying or falsely marking the older local files.
Reconciling 023-067 remains separate migration-governance work.

For the current evidence rollout, confirm migrations `068`–`072` and the three
release migrations below are applied before deploying the application. Migration
`073` is required for exact decision provenance, provider/model/prompt/ruleset
identity, input/output hashes, cache-origin timestamps, presentation rank, and
auditable sampling populations. The workflow
also verifies the extraction, adjudication, exclusion-sampling, and synthetic
canary schema required by the application before it reports success.

Migration `074` enforces terminal search state, persisted record completeness,
current human adjudications, and immutable approved evidence. Migration `075`
restricts privileged server RPCs and advances the release-schema marker to 75.
`npm start` runs `verify:schema` first; startup fails if the required columns or
marker are missing. The probe uses zero-row reads and logs no credentials.

Production migration history is preserved exactly as recorded by Supabase. The
repository filenames use the returned timestamp versions for the changes formerly
identified as 073–075:

| Change | Production version |
| --- | --- |
| 073 accuracy provenance | `20261009070635` |
| 074 release integrity | `20261009070945` |
| 075 server RPC permissions | `20261009071006` |

Do not rewrite production migration history or add duplicate numbered versions.
These files contain the same SQL that was applied; the matching timestamps prevent
the migration workflow from replaying them.

Existing report artifacts must be regenerated to include final human dispositions
and source coverage. New artifact names contain `_v2_report`; older artifact
links are not issued. Historical decision events remain unchanged.

Run the isolated SQL regression scripts listed in CI as well as the application
tests. They exercise approval integrity and server-RPC permissions but do not
simulate concurrent lock waits or replace live deployment verification.

### Optional alternative-provider shadow evaluation

Cloudflare models are evaluation-only and must not be configured as a production
fallback or regulatory decision authority. Leave
`NEURIDION_CLOUDFLARE_SHADOW_ENABLED=false` unless a controlled benchmark run has
been approved. When enabled, configure `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, and choose `glm` or `nemotron` with
`NEURIDION_CLOUDFLARE_SHADOW_MODEL`. Customer-controlled evidence is deliberately
not sent through this shadow path. Promotion to a production provider requires a
separate validated release and updated data-processing approval.

### Verify application integrations

Run with production env loaded:

```bash
npm run verify:env -- --mode production
npm run verify:integrations -- --mode production
npm run verify:release
```

## Post-Deploy Smoke Checks

Call these endpoints after deployment:

- `/`
- `/api/worker/health` with `x-worker-secret`
- `/api/worker/scraper-health` with `x-worker-secret`

## Notes

Integration verification checks connectivity and sentinel schema access. It does not replace applying Supabase migrations before deploy.
