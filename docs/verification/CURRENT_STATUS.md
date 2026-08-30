# Current verification status

Date: 2026-08-30

## PRRC search accuracy

The deterministic title filter is verified against:

- 15 reviewed BfArM records covering 10 manufacturer/product profiles.
- Cross-domain same-manufacturer separations, including MRI/CT,
  infusion/dialysis, insulin-pump/pacemaker, and AED/MRI products.
- Adversarial title variants for spacing, punctuation, family-level authority
  titles, near-prefix collisions, and same-manufacturer wrong products.

### 2026-08-30 re-verification

The 2026-06-22 run passed all gates (15/15 recall, 15/15 fields, 10/10 profiles). After
that date, BfArM authority revised reference 01737/26 to publication date 2026-07-14,
pushing it outside the gate's hardcoded scrape window (2026-01-05..2026-04-30). When the
gate was re-run at the start of this session, this revision caused failures (recall 14/15,
product 14/15, date 13/15, manufacturer 14/15, profiles 9/10). Root-cause audit identified
three authority revisions now tracked: 01737/26 (revised date), 14727/26 (date confirmed
2026-04-29), and 61735/25 (manufacturer omits GmbH suffix). A new authority record
(27552/26, COPRA System GmbH / COPRA6, dated 2026-06-30) was discovered post-snapshot and
logged as an acknowledged addition pending human PRRC review. The gate's scrape-window end
date is now derived from all known snapshot, revision, and addition dates (currently
2026-07-14) rather than hardcoded, ensuring future authority changes are automatically
captured.

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

## BfArM evidence capture

When BfArM is enabled through the regulatory-evidence capture allow-list, the
pipeline retains both exact adapter output and exact HTML response bytes in the
private evidence bucket. Stored request locators replace query values with a
SHA-256 fingerprint. Individual artifacts are limited to 50 MiB and one fetch
is limited to 100 MiB. MHRA, Swissmedic, and FDA do not yet claim raw-response
retention.

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
