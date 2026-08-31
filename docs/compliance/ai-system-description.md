# AI System Description

**Document ID:** NEUR-COMP-001  
**Version:** 0.2-draft  
**Date:** 2026-08-31  
**Status:** DRAFT — verify against the identified release and deployment  
**Required reviewers:** [ASSIGN: Product], [ASSIGN: qualified QA/RA], [ASSIGN: privacy/legal]

> This is a point-in-time technical description, not a legal opinion,
> certification, accuracy claim or customer validation record. Complete the
> release/deployment fields and obtain approval before external reliance.

## 1. Intended purpose

Neuridion assists qualified medical-device quality and regulatory personnel in
screening records from configured public regulatory sources against a
manufacturer-defined device profile. It records the original system output and
supports controlled human disposition and evidence export.

The system does not autonomously determine relevance, reportability or
regulatory action. It does not submit vigilance reports, initiate an FSCA,
replace the manufacturer's PMS source universe, or replace its QMS, PRRC or
qualified regulatory judgment.

## 2. Release and deployment identification

| Field | Controlled value |
| --- | --- |
| Release/build or commit | [ENTER] |
| Deployment/environment | [ENTER] |
| Database migration state | [ENTER remote-verified state] |
| Enabled sources | [ENTER] |
| Scheduled-ingestion configuration | [ENTER or NOT ENABLED] |
| Evidence-capture configuration | [ENTER or NOT ENABLED] |
| AI models | [ENTER exact deployed identifiers] |
| Prompt/ruleset version | [ENTER] |
| Controlled-evidence extractor | [ENTER] |
| Human-review/sampling policy | [ENTER] |

Repository code does not establish deployment state. Do not mark a capability
active from a migration or module existing locally.

## 3. System boundaries and flow

1. A customer defines a device profile and selects supported sources and dates.
2. Source adapters retrieve and normalize bounded public safety records.
3. Configured controlled documents are extracted, sanitized, hashed and
   versioned where the released pipeline supports that document type.
4. Deterministic rules and AI models assess potential relevance and produce
   `relevant`, `uncertain`, `excluded` or `filter_failed` output with rationale
   and model context where available.
5. Records requiring review receive immutable human-adjudication requirements.
6. Authorized users record provisional blind, final and, where required,
   independent second-review events without overwriting earlier evidence.
7. Controlled reports and a versioned machine-readable evidence-chain export
   are generated only through the applicable approval gate.

A document path by itself is not evidence that document content influenced a
classification. The decision record must identify the extracted content hash
and extractor/version context used. If configured controlled evidence cannot be
loaded completely, the pipeline must not silently continue as if it was used.

## 4. AI component

The repository pipeline currently identifies these Anthropic models:

| Model identifier | Repository role |
| --- | --- |
| `claude-haiku-4-5-20251001` | pre-filter for clear unrelated records |
| `claude-sonnet-4-6` | detailed relevance assessment |

Confirm the identifiers in the deployed decision records. Provider aliases and
repository constants are not sufficient release evidence.

For each assessed record, the system may generate:

- a screening category;
- written rationale;
- a model-generated confidence indicator; and
- model, prompt/ruleset and evidence-version context.

Confidence is not a calibrated probability and must not be presented as an
accuracy percentage or permission to skip required review.

## 5. Inputs and data handling

The screening request can include:

- source-record title, manufacturer, date and content text;
- device profile fields such as name, manufacturer, intended use, EMDN and
  device class; and
- bounded text from controlled IFU, PMS-plan or profile documents only where
  extraction succeeded and the active pipeline explicitly supplies it.

Authentication credentials, billing data and account passwords are not
classification inputs. Customers must not upload patient or clinical records to
the controlled-document workflow. Public safety and adverse-event records can
still contain incidental personal or sensitive information; public availability
does not remove the need for source-specific minimization, access, retention and
transfer controls.

See the current DPA, subprocessor schedule and approved privacy assessment for
the released data flow. Do not infer contractual training/retention terms from
this technical document.

## 6. Supported source adapters

The repository contains BfArM, FDA MAUDE, MHRA and Swissmedic adapters. Those
sources are a bounded subset of potential PMS inputs. A source is available to a
customer only when its deployed adapter and configuration have been verified.
The customer remains responsible for the source universe required by its PMS
plan, including unsupported internal and external sources.

## 7. Human-control design

- Non-excluded output and classification failures are review-blocking.
- Selected exclusions can be assigned blind-first review before AI reveal.
- The post-reveal final event is the operational regulatory disposition under
  the default policy; the provisional event remains validation evidence.
- Relevant-to-excluded material changes and serious-event exclusions can require
  independent confirmation and written rationale.
- Original AI output and human events are append-only; corrections are linked
  successor events.
- The manufacturer defines reviewer qualifications, authorization, separation
  of duties and the regulatory meaning of approval.

The presence of a user role or qualification attestation is not independent
proof that the person satisfies MDR Article 15 or the customer's procedures.

## 8. Validation and monitoring controls

The repository includes foundations for:

- immutable exclusion-sampling facts, including the inclusion probability at
  selection time;
- a pre-registered blind-first review arm;
- boundary, disagreement and small uniform-control sampling arms; and
- production-code-path synthetic canaries isolated by a Neuridion-owned profile.

Canaries detect known regressions and targeted sampling finds likely failure
modes. Neither alone establishes sensitivity. Agreement on surfaced records is
not an accuracy measure because relevant exclusions can be unobserved and
surfaced human labels can be affected by automation bias.

## 9. Known limitations

- AI and deterministic matching can produce false positives and false negatives.
- Upstream sources can be incomplete, unavailable, late or revised.
- Language, terminology, source structure and incomplete device evidence can
  materially affect output.
- Search success is not proof of source completeness.
- Scheduled ingestion and evidence capture are deployment-specific.
- Repository verification supports a bounded release; the customer must
  validate its own intended QMS use proportionate to risk.

## 10. Approval

| Review | Name | Decision/evidence | Date/signature |
| --- | --- | --- | --- |
| Technical accuracy against release | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| QA/RA intended-use and limitation review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Privacy/data-flow review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Legal/AI Act position review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
