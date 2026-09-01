# Human Oversight and Adjudication Procedure Template

**Document ID:** NEUR-COMP-003  
**Version:** 0.2-draft  
**Date:** 2026-08-31  
**Status:** DRAFT TEMPLATE — customer procedure and release verification required  
**Required reviewers:** [ASSIGN: Product], [ASSIGN: qualified QA/RA], [ASSIGN: customer process owner]

> This document describes repository control foundations. It does not prove
> that they are deployed, that a named user is qualified, or that a customer's
> procedure has been validated. Confirm the released configuration and complete
> all assignments before operational use.

## 1. Control objective

Neuridion provides advisory screening output. The manufacturer retains the
authority and responsibility to define who reviews it, determine relevance and
reportability, approve the final disposition, and initiate regulatory action.
The product must preserve system output and human decisions as distinct records.

## 2. Required customer decisions

The customer shall approve:

- qualified and authorized primary and secondary reviewer roles;
- which output and samples require review;
- the meaning of provisional, final and second-review dispositions;
- serious-event and downgrade escalation criteria;
- acceptable blind-first fraction and sampling policy;
- rationale, evidence and signature requirements;
- report/export release authority; and
- deviations, corrections, training and periodic-review procedures.

A platform role labelled `prrc` and a qualification attestation are controls,
not independent evidence that Article 15 or customer requirements are met.

## 3. Record-level workflow

### 3.1 Review requirements

The repository creates review requirements for AI `relevant`, `uncertain` and
`filter_failed` results. Selected AI exclusions receive a sampled-exclusion
requirement. A run cannot reach approved status while a required record lacks a
current final disposition or an applicable independent confirmation.

### 3.2 Blind-first arm

For records selected into the pre-registered blind arm:

1. the reviewer sees source evidence without the AI category, rationale or
   confidence;
2. the reviewer records a provisional disposition, confidence and rationale;
3. that event is locked and the AI output is revealed;
4. the reviewer records the final post-reveal disposition and rationale; and
5. the system preserves both events and their relationship.

The default policy treats the post-reveal final disposition as the operational
regulatory record. The provisional event remains validation evidence. If a
customer procedure defines a different regulatory record, that difference must
be approved and reflected in the export and report logic before use.

The blind fraction should be pre-registered, normally 10–20% for the initial
pilot unless another justified fraction is approved. It must be large enough to
measure human/system interaction without consuming unmanaged reviewer capacity.

### 3.3 Downgrades and second review

A final `excluded` disposition is a material change when it follows an AI,
provisional-human or previous-final `relevant` disposition. Material downgrades
require explicit written rationale. Serious-event exclusions and material
downgrades require confirmation by a different authorized reviewer under the
default repository policy.

The second reviewer must not be the author of the final disposition and must
record an independent event linked to that disposition. A conflicting second
review blocks completion and must be resolved under the customer's deviation or
escalation procedure; it must not be silently treated as confirmation.

### 3.4 Corrections

AI decisions and human events are append-only. A correction creates a new final
event linked to the superseded event. It does not rewrite or delete the earlier
decision. The customer must define when a corrected decision triggers report
reissue, downstream notification or further regulatory assessment.

## 4. Source and classification failure controls

- `uncertain` output is not a regulatory conclusion and requires human review.
- `filter_failed` output is review-blocking and must not be silently excluded.
- Source failures, degraded outcomes, caps and coverage warnings require an
  approved disposition or fallback before cycle/run approval.
- Search cancellation stops further processing but does not by itself resolve
  records already collected or any external surveillance obligation.

## 5. Reviewer-facing information

Before the operational final disposition, the reviewer should have access to:

- the source record and retrievable evidence;
- the approved device profile and controlled-evidence version used;
- source status, retrieval time, warnings and revision context;
- AI category, rationale, confidence indicator, model and prompt/ruleset version
  after any required blind provisional decision; and
- applicable customer criteria and escalation rules.

Confidence is a model indicator, not a calibrated correctness probability. The
interface and training must not imply that a high score authorizes exclusion.

## 6. Automation-bias and performance evidence

Recording the AI result before review does not create a counterfactual. The
blind-first arm provides the provisional human judgment needed to compare
blinded and revealed decisions. Analysis must include both sides of the
sensitivity calculation: relevant records surfaced by the system and estimated
relevant records among exclusions using retained inclusion probabilities.

Reviewer agreement on surfaced records alone must not be described as accuracy
or sensitivity. Surface-side labels can also be affected by automation bias.

## 7. Audit evidence

Each human event should retain:

- record, run and original filter-decision identifiers;
- phase and disposition;
- rationale and reviewer confidence where applicable;
- reviewer identity, role and qualification attestation;
- blind/revealed state;
- material-change, serious-event and second-review flags;
- linked provisional, superseded or reviewed event;
- model, prompt/ruleset, authority revision and evidence-parser snapshot where
  available; and
- immutable creation time.

The machine-readable continuity export should preserve these fields and the
applicable sampling facts so the decision chain can be inspected outside
Neuridion.

## 8. Training and authorization record

| Reviewer | Assigned role | Qualification evidence | Training version/date | Authorized by/date |
| --- | --- | --- | --- | --- |
| [ENTER] | [PRIMARY/SECONDARY/BOTH] | [REFERENCE] | [ENTER] | [ENTER] |

## 9. Release verification checklist

- [ ] migrations and approval gate verified in the deployed environment;
- [ ] customer role/assignment policy configured and tested;
- [ ] blind output is not disclosed before provisional lock;
- [ ] post-reveal downgrade rationale is retained;
- [ ] second-review conflicts block completion;
- [ ] canary/sampled records cannot contaminate customer outputs;
- [ ] evidence export reconstructs both provisional and final decisions;
- [ ] customer procedure, training and acceptance tests approved; and
- [ ] no unsupported accuracy or regulatory-approval claim appears in training.

## 10. Approval

| Role | Name | Decision | Date/signature |
| --- | --- | --- | --- |
| Neuridion product/technical | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Neuridion qualified QA/RA | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Customer process owner | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Customer validation authority | [ENTER] | [APPROVE/REJECT] | [ENTER] |
