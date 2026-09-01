# Supplier Assurance Pack Template

**Document ID:** NEUR-QMS-001  
**Version:** 0.1-draft  
**Date:** 2026-08-30  
**Status:** DRAFT TEMPLATE — not approved for customer or auditor reliance  
**Owners:** [ASSIGN: Product], [ASSIGN: Quality/Regulatory]  
**Required reviewers:** [ASSIGN: qualified QA/RA reviewer], [ASSIGN: legal counsel]

> This template is supplier evidence, not a certificate and not a completed
> validation of Neuridion within a customer's quality management system. The
> customer must define and approve its own intended use, risk classification,
> acceptance criteria, validation records, procedures, roles, and change-control
> requirements. Remove all placeholders and obtain the approvals above before
> external issue.

## 1. Purpose and release scope

This pack is designed to help a medical-device manufacturer assess Neuridion as
software used within a quality management system and assemble evidence for its
own validation. It covers:

- supplier and system identification;
- intended use and explicit limitations;
- responsibility allocation;
- software lifecycle, release, and change controls;
- requirements and verification traceability;
- known limitations and residual risks;
- a customer acceptance-test protocol;
- incident, continuity, export, and exit arrangements; and
- a draft EU AI Act classification position.

Complete this pack for one identified Neuridion release and customer
configuration. Do not combine evidence from different versions without a
documented impact assessment.

### Release identification

| Field | Controlled value |
| --- | --- |
| Neuridion release/version | [ENTER] |
| Git commit or immutable build ID | [ENTER] |
| Deployment environment and region | [ENTER] |
| Database migration state | [ENTER remote-verified migration IDs] |
| AI model identifiers | [ENTER] |
| Prompt/ruleset version | [ENTER] |
| Enabled authority sources | [ENTER] |
| Evidence-capture configuration | [ENTER] |
| Customer configuration baseline | [ATTACH/REFERENCE] |
| Pack issue date | [ENTER] |

## 2. Supplier and system identity

| Field | Value |
| --- | --- |
| Supplier legal entity | [LEGAL REVIEW: enter registered entity] |
| Registered address | [LEGAL REVIEW: enter] |
| Product | Neuridion |
| Product owner | [ENTER] |
| Security contact | info@neuridion.eu |
| Quality/regulatory contact | [ENTER] |
| Support and escalation route | [ENTER] |
| Hosting/subprocessor schedule | [REFERENCE current DPA/subprocessor list] |

Neuridion is a hosted software service that retrieves records from configured
public regulatory sources, normalizes those records, assesses potential
relevance against device-profile evidence, presents system output for human
review, and creates controlled exports.

## 3. Intended use statement

### 3.1 Supplier intended use

Neuridion is intended to **assist qualified medical-device regulatory and
quality personnel with screening public post-market safety records against a
manufacturer-defined device profile and preserving the resulting evidence and
human decision history**.

Neuridion output is a screening aid. The service is not intended to:

- make an autonomous regulatory determination;
- decide whether an event is reportable;
- approve, submit, or transmit a vigilance report to an authority;
- initiate a field safety corrective action;
- replace a PRRC, regulatory professional, or other qualified reviewer;
- replace the manufacturer's PMS system, risk-management process, or QMS;
- establish the completeness of the manufacturer's PMS source universe; or
- diagnose, prevent, monitor, predict, prognose, treat, or alleviate disease for
  an individual patient.

### 3.2 Customer-specific intended use

The customer shall complete and approve the following before operational use:

> [CUSTOMER TEMPLATE] We use Neuridion release **[VERSION]**, configured for
> **[DEVICE FAMILY/MARKETS]**, to support **[NAMED PMS PROCESS/PROCEDURE]** by
> retrieving **[SOURCES]**, presenting potential matches, and recording human
> dispositions. It does not replace **[LIST HUMAN REVIEWS/OTHER PMS SOURCES]**.
> The authoritative regulatory decision is **[IDENTIFY RECORD/SYSTEM/ROLE]**.

| Customer control | Approved definition |
| --- | --- |
| Device family and versions | [ENTER] |
| Countries/markets | [ENTER] |
| PMS process and procedure IDs | [ENTER] |
| Required source set and monitoring frequency | [ENTER] |
| Authorized roles and qualification requirements | [ENTER] |
| Decision and escalation rules | [ENTER] |
| Required downstream systems and records | [ENTER] |
| Retention period and legal basis | [ENTER] |

## 4. Responsibility allocation

| Activity | Neuridion supplier | Customer/manufacturer | PRRC/qualified reviewer |
| --- | --- | --- | --- |
| Maintain released service and supplier controls | Accountable | Informed | Informed |
| Define device profile and controlled evidence | Support | Accountable | Review/approve per procedure |
| Define PMS sources and frequency | Disclose supported scope | Accountable | Review/approve per procedure |
| Assess source warnings and degraded runs | Provide status/evidence | Accountable | Review/escalate |
| Interpret screening output | Explain system output/limitations | Accountable for procedure | Accountable for assigned regulatory judgment |
| Decide relevance/reportability/action | No autonomous authority | Accountable | Performs/approves as assigned |
| Validate intended QMS use | Provide supplier evidence | Accountable | Participates as assigned |
| Approve release/configuration for use | Provide release evidence | Accountable | Participates as assigned |
| Preserve required customer records | Provide export/retention functions as contracted | Accountable | Verify record completeness |

“PRRC” in product copy does not by itself establish that a user meets Article 15
qualification requirements. The customer's identity, authorization, training,
and segregation-of-duty controls govern who may perform or approve each action.

## 5. Customer validation responsibility — ISO 13485 clause 4.1.6

Where a manufacturer uses Neuridion in its QMS, the manufacturer determines the
appropriate validation approach for that application before initial use and,
where appropriate, after changes. The approach and effort should be
proportionate to the risk associated with the software's intended use.

Neuridion can provide supplier evidence and test templates. That evidence does
not validate the customer's:

- intended use or regulatory interpretation;
- device and market configuration;
- source universe or monitoring schedule;
- user roles, training, and approval procedure;
- interfaces with an eQMS or other downstream systems;
- operating environment or local controls; or
- acceptance criteria.

The customer should record at minimum:

1. intended use and prohibited use;
2. risk assessment and validation rationale;
3. approved requirements and traceability;
4. configuration and release baseline;
5. executed acceptance tests and deviations;
6. reviewer training and authorization;
7. change-assessment and periodic-review procedure; and
8. approval for operational use.

## 6. Software lifecycle and release evidence

The release evidence supplied for each controlled version should include:

- immutable build/commit identifier;
- release notes and known limitations;
- approved requirements or change request IDs;
- risk/control impact assessment;
- migration inventory and verified deployment state;
- static analysis, type-check, unit/integration test, and build results;
- bounded classifier/source benchmark results with dataset scope;
- unresolved defect and security-vulnerability assessment;
- AI model, prompt, rule, and source-adapter versions;
- rollback/recovery decision and procedure; and
- release approval identities and timestamps.

Passing repository tests is not proof of universal search completeness,
classification sensitivity, or suitability for a customer's intended use.

### 6.1 Release/change classification

| Change class | Examples | Minimum customer-facing control |
| --- | --- | --- |
| Critical | Decision semantics, exclusion logic, evidence chain, authorization, export integrity | Advance notice where feasible, supplier re-verification, customer impact assessment and revalidation before use |
| Major | New source, model/prompt change, device-evidence input, schema change affecting regulated records | Release note, traceability/risk update, regression evidence, customer revalidation decision |
| Minor | Non-material workflow or report change | Release note and documented validation-impact decision |
| Emergency | Security or source-break repair | Expedited approval, documented risk acceptance, retrospective evidence completion and customer notice |

Model-provider aliases are not acceptable release identifiers. The deployed
model ID and effective prompt/ruleset version must be recorded with each decision
where technically available.

## 7. Requirements traceability template

Populate this matrix with approved requirements and link each row to objective
evidence. “Pass” without a test record is not traceability.

| Requirement ID | Requirement | Risk/control | Design or implementation reference | Verification evidence | Result | Approver |
| --- | --- | --- | --- | --- | --- | --- |
| PMS-RET-001 | Retrieve records from each configured supported source and expose source status | Missed signal due to silent source failure | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| PMS-ID-001 | Preserve source identity and retrieval provenance for included records | Non-reproducible evidence | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| PMS-AI-001 | Label AI-assisted output and retain model/prompt/ruleset context | Untraceable automated output | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| PMS-OVR-001 | Require authorized human disposition before controlled report release | Unreviewed output treated as decision | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| PMS-AUD-001 | Retain original output, human disposition, rationale, identity, and timestamp | Decision history overwritten | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| PMS-EXP-001 | Export a self-contained, verifiable evidence package | Vendor failure prevents reconstruction | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| PMS-SEC-001 | Prevent cross-customer access | Confidentiality/integrity breach | [ENTER] | [TEST/RUN ID] | [ENTER] | [ENTER] |
| [ADD] | [CUSTOMER REQUIREMENT] | [RISK] | [REFERENCE] | [EVIDENCE] | [RESULT] | [APPROVER] |

## 8. Known limitations and residual risks

| Limitation | Potential effect | Required control |
| --- | --- | --- |
| Supported sources are a bounded subset of possible PMS inputs | Relevant information may exist outside Neuridion | Customer maintains approved PMS source matrix and parallel processes |
| Upstream sources can be late, unavailable, revised, or structurally changed | Missing, stale, or changed evidence | Review source status/warnings; reconcile revisions; escalation and fallback procedure |
| AI and deterministic matching can produce false positives and false negatives | Relevant record missed or reviewer burden increased | Conservative configuration, human review, canaries, disagreement/boundary sampling, and periodic validation |
| Confidence values are not calibrated probabilities | Reviewer over-reliance | Training, interface disclosure, and decision based on evidence rather than score alone |
| Human labels can be affected by automation bias | Biased acceptance or downgrade | Pre-registered blind-first arm, provisional disposition before reveal, and rationale/second-review rules |
| Device profile or evidence may be incomplete or outdated | Incorrect relevance assessment | Version-controlled customer evidence and approval before use |
| Source evidence can contain incidental personal or sensitive information | Data-protection exposure | Source-specific minimization/redaction, access control, DPA and customer handling procedure |
| Scheduled ingestion is configuration-dependent | Expected surveillance may not run | Deployment verification, scheduler health monitoring, alerting and documented manual fallback |
| Vendor/service outage or failure | Loss of access to canonical decision history | Routine customer exports, tested restore/reconstruction, continuity and exit provisions |

The customer and supplier shall maintain a controlled, release-specific known
issues list: **[ATTACH/REFERENCE]**.

## 9. Accuracy monitoring and sampling controls

No accuracy percentage may be claimed from reviewer agreement on surfaced
records alone. That design does not observe relevant records incorrectly
excluded and may contain automation bias on the surfaced numerator.

For any operational sampling program, retain on each sampled record at selection
time:

- immutable inclusion probability;
- sampling policy and version;
- stratum and reason for selection;
- model/prompt/ruleset and profile/evidence versions;
- selection timestamp; and
- blinded/unblinded assignment.

Recommended layered controls:

1. **Production-parity canaries:** use a Neuridion-owned synthetic device profile
   in the production tenant and prove synthetic records cannot appear in any
   customer-scoped query, count, report, or export.
2. **Disagreement mining:** challenge exclusions using mechanisms designed to
   fail differently, such as deterministic serious-event rules, broader
   retrieval, source-native fields, and an independently designed model/prompt.
3. **Boundary sampling:** weight review toward low-confidence exclusions,
   serious-event language, source anomalies, and changed evidence.
4. **Uniform control arm:** retain a small probability sample with recorded
   inclusion probabilities to support unbiased estimation when volume permits.
5. **Blind-first review:** pre-register 10–20% or another approved fraction;
   capture a provisional human disposition before revealing system output.

The final post-reveal disposition is the operational regulatory record unless
the customer's procedure defines otherwise. A provisional `relevant` decision
downgraded after reveal requires written rationale. Serious-event downgrades or
material human/system disagreement should require a second qualified reviewer
under the customer's approved procedure.

## 10. Customer acceptance-test protocol

### 10.1 Preconditions

- [ ] Customer intended use and excluded use approved
- [ ] Device family, versions, manufacturer identity, markets, and evidence baseline approved
- [ ] Required sources and monitoring frequency approved
- [ ] Test users, roles, and qualifications documented
- [ ] Release, configuration, migration state, models, prompts, and rulesets frozen
- [ ] Expected records and results approved independently of Neuridion output
- [ ] Incident/deviation process and acceptance authority named

### 10.2 Test cases

| Test ID | Objective | Method | Expected result | Actual evidence/result |
| --- | --- | --- | --- | --- |
| UAT-01 | Authentication and tenant isolation | Attempt authorized and unauthorized access with approved test accounts | Only authorized customer records are accessible | [ENTER] |
| UAT-02 | Device baseline | Create/select the approved device profile and controlled evidence version | Run retains the approved snapshot/version | [ENTER] |
| UAT-03 | Source coverage | Run each required supported source for a defined period | Each source reports bounded outcome, counts, time, and warnings; no silent success | [ENTER] |
| UAT-04 | Known relevant record | Process approved positive controls for the device family | Records surface for human review under customer-defined acceptance criteria | [ENTER] |
| UAT-05 | Known non-relevant/near match | Process approved negative and adversarial controls | Output and rationale are recorded; no unsupported automated final decision | [ENTER] |
| UAT-06 | Ambiguity/failure | Force uncertain and classification/source failure cases | Manual-review/degraded status is conspicuous and retained | [ENTER] |
| UAT-07 | Human disposition | Complete authorized record-level review and rationale | Original output and human action remain distinguishable and traceable | [ENTER] |
| UAT-08 | Approval gate | Attempt export before and after required disposition/approval | Controlled export is blocked until customer-defined gate is satisfied | [ENTER] |
| UAT-09 | Evidence reconstruction | Reconstruct one decision from export without application access | Source evidence, versions, actions, rationale, identity, time, and hashes can be verified | [ENTER] |
| UAT-10 | Synthetic isolation | Run production-parity canary and query customer reports/exports | Zero synthetic records or counts enter customer scope | [ENTER] |
| UAT-11 | Change control | Apply a representative model/rules/config change in validation scope | Change is detected, assessed, and revalidation decision recorded | [ENTER] |
| UAT-12 | Recovery/exit | Export and restore/review the agreed continuity package | Customer can read and verify the full agreed evidence chain | [ENTER] |

### 10.3 Acceptance and deviations

The customer shall define quantitative and qualitative acceptance criteria before
execution. Failed tests, deviations, workarounds, and residual-risk acceptance
must be approved by the customer's named validation authority. Supplier
resolution does not automatically approve customer use.

| Approval | Name/role | Decision | Date/signature |
| --- | --- | --- | --- |
| Test executor | [ENTER] | [ENTER] | [ENTER] |
| Customer QA | [ENTER] | [ACCEPT/REJECT] | [ENTER] |
| Customer regulatory/PRRC | [ENTER] | [ACCEPT/REJECT] | [ENTER] |
| System owner | [ENTER] | [RELEASE/DO NOT RELEASE] | [ENTER] |

## 11. Continuity, export, and exit

Because Neuridion may hold the canonical surveillance decision history, the
customer must be able to reconstruct the agreed evidence chain without continued
access to the live service.

The contracted exit package should define:

- machine-readable format and schema version;
- raw/source evidence or permitted references and content hashes;
- retrieval metadata and source identity;
- customer device-evidence versions used;
- original system output, model, prompt, and ruleset version;
- provisional, final, and secondary human dispositions;
- rationale, role, identity, timestamps, and signature meaning;
- sampling inclusion probabilities and policy versions;
- warnings, source health, revisions, and approval history;
- manifest, checksums, and offline verification instructions; and
- retention, deletion, transfer timing, fees, and support responsibilities.

Customer acceptance must test the export outside Neuridion. An undocumented JSON
dump is not sufficient evidence of reconstructability.

Select and contractually approve the continuity mechanism; this template does
not promise one by itself:

- [ ] scheduled customer-controlled evidence exports;
- [ ] defined post-termination read/export period;
- [ ] source-code or build escrow with objective release conditions;
- [ ] insolvency/cessation assistance commitment;
- [ ] named data-transition service and response time; or
- [ ] other: [ENTER].

## 12. Security, privacy, incident, and support evidence

Attach or reference the current approved versions of:

- security architecture and access-control summary;
- vulnerability and dependency review;
- backup, recovery, and restore-test evidence;
- incident-response and customer-notification procedure;
- DPA, subprocessor list, processing locations, and transfer mechanism;
- retention/deletion design and customer configuration;
- availability/support commitments and escalation contacts; and
- open security/privacy risks accepted for this release.

Public authority records, including adverse-event data, may contain incidental
personal or sensitive information. The phrase “public data” is not a substitute
for a source-specific privacy assessment.

## 13. Draft EU AI Act position

**DRAFT — requires EU AI Act counsel and qualified QA/RA approval. This is not a
legal opinion.**

### Working position

Based only on the intended use in Section 3, Neuridion is not intended to be a
medical device and is not intended as a safety component of a medical device.
It does not control a device, provide patient-specific clinical information, or
make an autonomous vigilance or regulatory decision. On that bounded intended
use, the present working position is that the Neuridion screening function does
not meet Article 6 high-risk criteria through an Annex I product/safety-component
route and does not match an Annex III use case.

“Limited risk” and “minimal risk” should not be used as if they were formal
certification outcomes. The exact application of Article 50 depends on the
deployed function and provider/deployer role. Neuridion labels AI-assisted
output, explains human oversight and limitations, and records model context as
governance controls; counsel must determine which measures are legally required
for the released configuration.

This position does not remove:

- the manufacturer's MDR/IVDR and PMS obligations;
- customer validation obligations for software used in the QMS;
- GDPR and data-protection obligations where personal data is processed;
- provider/deployer obligations that may follow from a changed intended use; or
- obligations arising from the upstream model/provider relationship.

### Mandatory reassessment triggers

Reassess and reapprove before release if Neuridion is changed to:

- autonomously suppress, close, approve, or submit a regulatory decision;
- function as or within a medical device or its safety component;
- process patient-specific data for a medical purpose;
- control an authority submission or safety action without effective human
  decision-making;
- serve a use case described in Annex III;
- materially change its model, intended users, or decision authority; or
- operate under amended law, delegated acts, or new Commission/authority
  guidance relevant to classification.

### Counsel/QA approval record

| Review question | Decision/evidence |
| --- | --- |
| Final product intended use approved? | [ENTER] |
| MDR/IVDR software qualification analysis approved? | [ENTER] |
| AI Act Article 6 and Annex III analysis approved? | [ENTER] |
| Applicable Article 50 duties identified by paragraph and role? | [ENTER] |
| Upstream model/provider role and contractual evidence reviewed? | [ENTER] |
| National guidance/delegated acts checked as of date? | [ENTER] |

## 14. Final issue approval

No section may remain a placeholder when the pack is issued externally.

| Role | Name | Decision | Date/signature |
| --- | --- | --- | --- |
| Neuridion product owner | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Neuridion QA/RA reviewer | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Neuridion legal counsel | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Customer system owner | [ENTER] | [ACCEPT/REJECT] | [ENTER] |
| Customer QA/RA authority | [ENTER] | [ACCEPT/REJECT] | [ENTER] |

## Appendix A — Required attachments

- [ ] Release notes and immutable build identification
- [ ] Requirements traceability matrix
- [ ] Verification summary and detailed test evidence
- [ ] Known issues and residual-risk register
- [ ] Security/privacy/subprocessor evidence
- [ ] Customer-approved intended use and configuration baseline
- [ ] Executed customer acceptance-test report
- [ ] Training and authorization records
- [ ] Export schema, sample package, and offline verification instructions
- [ ] Contracted continuity/exit schedule
- [ ] Approved EU AI Act position
