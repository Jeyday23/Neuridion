# AI Transparency Notice Template

**Document ID:** NEUR-COMP-004  
**Version:** 0.2-draft  
**Date:** 2026-08-31  
**Status:** DRAFT — release, role and legal review required  
**Required reviewers:** [ASSIGN: Product], [ASSIGN: QA/RA], [ASSIGN: privacy/legal]

> This template supports transparent product communication. It does not by
> itself fulfill every EU AI Act duty and is not a legal opinion. Counsel must
> identify the duties that apply to the deployed function and each party's role.

## 1. What Neuridion does

Neuridion uses deterministic matching and Anthropic language models to assess
the potential relevance of supported public safety records to a
manufacturer-defined device profile. The system produces an advisory category,
rationale and model-generated confidence indicator for human review.

Neuridion does not decide reportability, submit a vigilance report, initiate an
FSCA or take another autonomous regulatory action. The manufacturer defines the
required PMS sources and procedures, assigns qualified reviewers, owns the final
disposition and decides all downstream action.

## 2. Released system identification

| Field | Value shown to user/customer |
| --- | --- |
| Release/build | [ENTER] |
| Enabled sources | [ENTER] |
| AI model identifiers | [ENTER exact deployed IDs] |
| Prompt/ruleset version | [ENTER] |
| Controlled-evidence extractor/version | [ENTER] |
| Human-review/sampling policy | [ENTER] |
| Notice effective date | [ENTER] |

## 3. Output meaning

- `relevant`: system evidence indicates a plausible relationship requiring
  qualified review;
- `uncertain`: the system could not establish a sufficiently clear screening
  outcome and human review is required;
- `excluded`: the system did not find sufficient relevance under the released
  configuration; this is not proof that the record is irrelevant; and
- `filter_failed`: no usable AI assessment was completed and manual review is
  required.

Confidence values are model-generated indicators. They are not calibrated
probabilities, accuracy percentages or guarantees of completeness.

## 4. Human control

Required records receive an authorized human final disposition before the
controlled run/report release gate is satisfied. Selected records can be shown
blind-first: a provisional human assessment is locked before the AI output is
revealed, then the reviewer records the final operational disposition. Material
relevant-to-excluded changes and serious-event exclusions can require a second
qualified reviewer.

The manufacturer controls reviewer appointment, qualification, authorization,
training, separation of duties, escalation and the meaning of approval. A role
label or self-attestation inside Neuridion is not proof of legal qualification.

## 5. Data supplied to the AI service

Depending on the released configuration, the request may include:

- source-record title, manufacturer, date and content text;
- product-profile fields such as device name, manufacturer, intended use, EMDN
  and device class; and
- bounded extracted text from configured controlled documents where extraction
  completed successfully and the pipeline explicitly includes it.

Passwords, authentication tokens, billing details and account credentials are
not classification inputs. Customers must not upload patient or clinical
records into this workflow. Public safety and adverse-event sources can contain
incidental personal or sensitive information, so source-specific minimization,
access, retention and transfer controls still apply.

Consult the current DPA and subprocessor schedule for processing locations,
contractual roles, provider terms and retention. Do not rely on this notice as a
substitute for those documents.

## 6. Known limitations

- The system can produce false positives and false negatives.
- A completed search does not prove that every relevant record was retrieved or
  identified.
- Upstream sources can be late, incomplete, unavailable, capped or revised.
- Output depends on the selected sources, dates, profile, device evidence,
  source language/structure, model and ruleset.
- Controlled documents influence output only where content was successfully
  extracted, versioned and supplied to the model; a stored path is insufficient.
- Repository tests and bounded benchmarks do not establish universal accuracy
  or validate a customer's intended QMS use.
- Scheduled ingestion and evidence capture are configuration-dependent and must
  be verified for the identified deployment.

## 7. Performance and validation statements

Neuridion makes no universal sensitivity, specificity or accuracy claim. Human
agreement on records surfaced by the system cannot observe relevant records
incorrectly excluded and may be affected by automation bias. Any reported
performance metric must identify the dataset, source/language/device strata,
release, configuration, inclusion probabilities, adjudication method and
confidence interval.

The supplier can provide a release-specific supplier assurance pack and
acceptance-test template. The manufacturer remains responsible for validation
of Neuridion for its intended use in the customer's QMS.

## 8. Evidence, continuity and exit

The released platform can provide controlled reports and a versioned
machine-readable evidence-chain export. Contracted continuity terms determine
retention, export frequency, post-termination access, transition support,
escrow/cessation commitments and permitted source-content transfer. Customers
should test offline reconstruction before treating Neuridion as the canonical
decision record.

## 9. Draft EU AI Act position

The current working position is that the bounded screening function is not a
high-risk AI system under Article 6 because it is not intended as a medical
device or safety component and does not match an Annex III use case. This is a
draft reasoned position, not a certification or legal opinion. It must be
reassessed against the deployed capability, intended use, party roles, current
law and guidance. The exact application of Article 50 must be confirmed by
qualified counsel rather than inferred from a general risk label.

## 10. Review and approval

| Review | Name | Decision/evidence | Date/signature |
| --- | --- | --- | --- |
| Technical truth against release | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| QA/RA review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Privacy/data-flow review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| AI Act/legal review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
