# Source-authority matrix

The executable contract is `lib/evidence/source-authority.ts`. This document
explains the boundaries; tests prevent the high-risk columns from drifting.

| Source | Evidence role | Official acquisition | Current retained object | Cross-source action key | Personal-data posture |
|---|---|---|---|---|---|
| BfArM | Field safety notices | HTML primary; RSS supplement; Firecrawl fallback | Exact HTML responses plus adapter output when evidence capture is enabled | Manufacturer/issuer reference composite, when validated | Public-record risk considered low |
| MHRA | Field safety notices | GOV.UK API plus official Excel cross-check | Exact merged adapter output | Manufacturer/issuer reference composite, when validated | Public-record risk considered low |
| Swissmedic | Corrective actions | Structured REST API | Exact adapter output | Manufacturer/issuer reference composite, when validated | Public-record risk considered low |
| FDA MAUDE | Adverse-event signals, not FSNs | Live openFDA query | Adapter output only after separate sensitive-data approval | None; link as corroborating signal only | Third-party personal data possible |
| EUDAMED Vigilance | Reserved future source | No operational adapter | None | Issuer reference composite; Basic UDI-DI is supporting device evidence only | Reassess when an interface is operational |

## Corrections to the proposed matrix

- Basic UDI-DI identifies a device family. It is never sufficient to identify
  one corrective action and is not a master reconciliation key.
- FDA interactive MAUDE retrieval is deliberately capped and is not certified
  FSN coverage. Complete MAUDE surveillance requires a separate bulk workflow.
- MHRA API/Excel divergence is a diagnostic. The two official channels are not
  required to have identical counts, and no alert threshold is claimed until a
  representative baseline establishes one.
- BfArM retains exact HTML responses when evidence capture is enabled. MHRA,
  Swissmedic, and FDA currently retain adapter output only; linked files are not
  yet retained. Raw-response claims must remain source-specific.
- A live health probe measures availability and source outcome. It cannot
  calculate publication-to-ingestion freshness or reconciliation quality; those
  require scheduled-ingestion and observation-ledger data.

## Completeness contracts

- BfArM and Swissmedic: `complete` or `empty` certifies only the requested range.
  BfArM archive-limited ranges remain partial and are not advanced as coverage.
- MHRA: both official channels run; available records are conservatively merged.
  A failed channel makes the result partial. Parity is emitted separately.
- FDA: capped interactive results remain signals and never advance shared
  `sync_coverage`.
- EUDAMED: no completeness or freshness promise until an official
  machine-readable Vigilance interface is verified.

## Rollout controls

Evidence capture requires all of:

1. migration 068 applied and the private bucket verified;
2. `REGULATORY_EVIDENCE_CAPTURE=true`;
3. the source in `REGULATORY_EVIDENCE_SOURCES`;
4. for FDA, `REGULATORY_EVIDENCE_ALLOW_SENSITIVE=true` after policy approval.

Start with one EU source. Do not enable FDA merely to test the feature.
