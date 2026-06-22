# Current verification status

Date: 2026-06-22

## PRRC search accuracy

The deterministic title filter is verified against:

- 15 reviewed BfArM records covering 10 manufacturer/product profiles.
- Cross-domain same-manufacturer separations, including MRI/CT,
  infusion/dialysis, insulin-pump/pacemaker, and AED/MRI products.
- Adversarial title variants for spacing, punctuation, family-level authority
  titles, near-prefix collisions, and same-manufacturer wrong products.

The latest focused run passed 39/39 tests. This is evidence for the reviewed
cases, not a claim of universal or 100% search accuracy. New authority title
formats must be added to the reviewed fixture and regression matrix.

## Accuracy controls

- Product signatures require their independent distinguishing components.
- Family/model aliases remain alternatives within the same component.
- Product, domain, and competitor signals use boundary-aware matching.
- Near-prefix text such as `HeartStarter` does not satisfy `HeartStart`.
- Formatting variants such as `MiniMed 780 G` and `REHA Complete` are accepted
  for their reviewed compact or punctuated profiles.
- PRRC release requires explicit approval, reviewer identity, and a valid review
  timestamp; review transitions use optimistic compare-and-set behavior.

## Scraper interpretation

Source acquisition and profile filtering are separate. A source can fetch
records successfully and then retain zero records because none match the search
profile. Therefore, `keyword filter: X -> 0` alone does not prove scraper
failure. Use source outcome, raw count, warnings, cache contribution, and filter
audit together.

The live scraper integration suite is the source-adapter regression gate. Live
authority results remain time-dependent and should be recorded with the test
date and query scope.

## Known limitations

- Reviewed fixtures cannot cover every manufacturer, product, language, or
  future authority title format.
- AI billing failure can reduce optional AI classification/enrichment, but the
  deterministic acquisition, matching, evidence, and PRRC review controls must
  continue to operate and report degraded status honestly.
- An FDA API key is required for reliable authenticated local/live FDA checks.
- Production health checks require `WORKER_API_SECRET`.
- Email delivery requires a verified sender domain and is independent of search
  accuracy.

## Release interpretation

Ship decisions require the full regression, build, reviewed benchmark, live
adapter checks, environment verification, and authenticated production health
checks in [RUNBOOK.md](./RUNBOOK.md). A passing unit suite alone is not a
production-readiness claim.
