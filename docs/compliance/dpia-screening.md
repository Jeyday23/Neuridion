# Draft DPIA Screening Template

**Document ID:** NEUR-COMP-006  
**Version:** 0.2-draft  
**Date:** 2026-08-31  
**Status:** DRAFT — privacy/legal review and deployment data-flow verification required  
**Release/build assessed:** [ENTER]

> This template does not conclude that a DPIA is unnecessary. The controller
> must complete the factual data-flow, role, scale, legal-basis and supervisory-
> authority analysis for the actual deployment and intended use.

## 1. Processing under assessment

Neuridion retrieves and stores supported public regulatory safety records,
matches them to customer device profiles, sends bounded screening inputs to an
AI API, records system/human decisions and produces reports and evidence
exports. Account, security, billing, controlled-document and audit processing
also occur outside the classification request.

## 2. Role and data-flow record

Do not assume one controller/processor role for every activity. Complete the
contractual role mapping below.

| Processing activity | Data categories | Data subjects | Controller | Processor/subprocessor | Location/transfer | Legal basis |
| --- | --- | --- | --- | --- | --- | --- |
| Account and authentication | [ENTER] | users | [ENTER] | [ENTER] | [ENTER] | [ENTER] |
| Public-source retrieval/evidence | [ENTER] | possible incident reporters/patients/clinicians | [ENTER] | [ENTER] | [ENTER] | [ENTER] |
| Device profile and documents | [ENTER] | authors/contact persons if present | [ENTER] | [ENTER] | [ENTER] | [ENTER] |
| AI-assisted screening | [ENTER] | [ENTER] | [ENTER] | Anthropic/[VERIFY] | [ENTER] | [ENTER] |
| Human decisions/audit history | [ENTER] | reviewers/users | [ENTER] | [ENTER] | [ENTER] | [ENTER] |
| Billing, support and email | [ENTER] | users/contacts | [ENTER] | [ENTER] | [ENTER] | [ENTER] |

Customer regulatory duties do not automatically establish Neuridion's own legal
basis. Each legal basis must be documented for the party and purpose relying on
it.

## 3. Data categories and minimization

Expected classification inputs can include source-record title, manufacturer,
date and content; device-profile metadata; and bounded extracted text from
configured controlled documents. User credentials and billing data are not
classification inputs.

Public availability is not proof that source text contains no personal or
special-category data. Adverse-event and safety records can include incidental
patient, reporter, clinician or contact information and health-event detail.
Before enabling a source or evidence path, record:

- fields and raw text collected;
- likely personal/special-category content;
- source-specific sanitization/redaction;
- AI fields sent and purpose necessity;
- access, retention, deletion/anonymization and legal-hold controls;
- transfer mechanism and transfer-impact assessment where required; and
- residual risks and approved exceptions.

Customers must not upload patient or clinical records to the profile-document
workflow. That instruction does not remove the need for technical controls or
incident handling if prohibited data is supplied.

## 4. DPIA trigger screen

| Criterion | Preliminary position | Required evidence |
| --- | --- | --- |
| Systematic/extensive evaluation of natural persons with legal or similar effect | Screening purpose is document/device relevance, not natural-person evaluation | Verify actual use, outputs, integrations and downstream decisions |
| Article 22 solely automated decision | No intended natural-person decision; human regulatory disposition remains required | Verify no autonomous downstream action and complete data-subject analysis |
| Large-scale Article 9/10 data | Unknown until each source, volume and retention path is assessed | Quantify incidental health/criminal data, scale and access |
| Systematic monitoring | Public database monitoring is not physical public-space monitoring, but broader criteria still require review | Check EDPB/national criteria and actual user/activity monitoring |
| Novel technology/AI combined with additional high-risk criteria | Potentially relevant | Complete national DPIA-list and multi-criteria assessment |
| Vulnerable data subjects | Possible patients in source records | Source-specific content assessment |
| International transfers | Potentially present | Current subprocessor, transfer mechanism and supplementary-measure review |
| Supervisory-authority mandatory list | Not assessed | Check each relevant authority and approval date |

## 5. Automation and human review

The intended screening output concerns record-to-device relevance and is not
intended to produce a legal or similarly significant effect on a natural person.
Human oversight does not automatically remove data-protection risk. Confirm the
actual workflow, whether natural persons are identifiable in inputs/outputs, and
whether customer or Neuridion decisions create downstream effects.

Blind-first review is a validation control for automation bias, not a GDPR legal
basis or substitute for a DPIA.

## 6. Preliminary decision

Select only after completing Sections 2–5:

- [ ] Full DPIA required before processing
- [ ] Full DPIA not legally required but completed as a risk-control measure
- [ ] Full DPIA not required — reasoned evidence attached
- [ ] Processing must not proceed until open facts are resolved

**Decision rationale:** [ENTER]  
**National/EDPB sources checked and date:** [ENTER]  
**Residual risks and approver:** [ENTER]

## 7. Reassessment triggers

Reassess before enabling a new source, raw evidence retention, sensitive-data
capture, controlled-document class, geography, subprocessor/model, automated
action, material scale increase, longer retention or new customer use.

## 8. Approval

| Review | Name | Decision/evidence | Date/signature |
| --- | --- | --- | --- |
| Technical data-flow verification | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Privacy owner/DPO assessment | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Legal basis and transfer review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Final controller decision | [ENTER] | [APPROVE/REJECT] | [ENTER] |
