# Verification runbook

Run from the repository root.

## 1. Deterministic PRRC accuracy

```bash
npx vitest run \
  __tests__/prrc-multi-product-accuracy.test.ts \
  lib/search/__tests__/pre-filter.test.ts \
  __tests__/bfarm-profile-filter.test.ts
npm run benchmark:reviewed-pms
```

Reject vacuous results such as `0/0`. Review identity-level and field-level
agreements, not only aggregate counts.

## 2. Full local regression

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

## 3. Live source adapters

Load local secrets without printing them, then run the live source suite:

```bash
set -a
source .env.local
set +a
RUN_LIVE_SCRAPER_TESTS=true npx vitest run __tests__/integration/scraper-validation.test.ts
```

For every source, inspect acquisition outcome, raw count, warnings, coverage,
cache contribution, deduplication, and keyword-filter audit. A filtered result
of zero is acceptable only when acquisition succeeded and the evidence supports
zero relevant matches.

## 4. Release and integration gates

```bash
npm run verify:env
npm run verify:integrations
npm run verify:release
```

Use production-mode environment values for a production release decision.

## 5. Authenticated production health

After loading `.env.local` as above:

```bash
curl --fail-with-body --silent --show-error \
  -H "x-worker-secret: $WORKER_API_SECRET" \
  https://kodex-4-medical.onrender.com/api/worker/health
```

Never paste the expanded header or secret into logs, issues, commits, reports,
or screenshots. Verify HTTP status, recent run outcomes, stuck runs, per-source
health, and warnings.

## 6. Evidence recording

Record the commit SHA, UTC timestamp, commands, pass/fail counts, live query
scope, and known limitations. Do not record secret values or raw sensitive
payloads.
