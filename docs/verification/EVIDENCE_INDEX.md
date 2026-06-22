# Evidence index

## Accuracy and PRRC

- `__tests__/prrc-multi-product-accuracy.test.ts` — reviewed multi-product and
  adversarial title matching.
- `__tests__/fixtures/bfarm-pms-2026.json` — reviewed BfArM identity fixture.
- `__tests__/bfarm-profile-filter.test.ts` — pipeline keyword audit behavior.
- `lib/search/__tests__/pre-filter.test.ts` — production pre-filter behavior.
- `benchmark/reviewed-pms.ts` — reviewed identity and field comparison.
- `scripts/prrc-review.ts` — PRRC review workflow.

## Source adapters and health

- `__tests__/integration/scraper-validation.test.ts` — live adapter checks.
- `__tests__/scraper-health-authority.test.ts` — health authority behavior.
- `lib/scrapers/` — source adapters and registry.
- `lib/pipeline/stages/scrape.ts` — acquisition/filter boundary and audit.

## Release gates

- `scripts/verify-env.ts` — required environment validation.
- `scripts/verify-integrations.ts` — external integration probes.
- `scripts/verify-release.ts` — composed release gate.
- [`../DEPLOYMENT_CHECKLIST.md`](../DEPLOYMENT_CHECKLIST.md) — deployment steps.

## Security and compliance

- [`../SECURITY_AUDIT.md`](../SECURITY_AUDIT.md) — security audit record.
- [`../compliance/README.md`](../compliance/README.md) — compliance document index.
- [`../compliance/source-authority-matrix.md`](../compliance/source-authority-matrix.md)
  — source authority and permitted use.
- [`../compliance/regulatory-evidence.md`](../compliance/regulatory-evidence.md)
  — evidence-layer controls.
- [`../compliance/human-oversight.md`](../compliance/human-oversight.md) — human
  review and oversight.
- [`../compliance/scheduled-ingestion.md`](../compliance/scheduled-ingestion.md)
  — scheduled ingestion workflow.
