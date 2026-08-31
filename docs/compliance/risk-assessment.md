# Draft EU AI Act Classification Position

**Document ID:** NEUR-COMP-002  
**Version:** 0.2-draft  
**Date:** 2026-08-30  
**Status:** DRAFT — requires EU AI Act counsel and qualified QA/RA approval  
**Reviewer:** [REVIEW: assign counsel and qualified QA/RA reviewer]

> This is a working product-position document, not a legal opinion,
> certification, or final classification. Confirm the analysis against the
> released intended use, deployed functions, contractual roles, applicable
> guidance, delegated acts, and current law before external use.

## 1. System and intended use under assessment

Neuridion retrieves records from configured public regulatory sources, assesses
their potential relevance to a manufacturer-defined device profile, and
preserves system output and human review history. The output is an advisory
screening aid for qualified medical-device quality and regulatory personnel.

Under this intended use Neuridion does not:

- control or form part of a medical device;
- provide patient-specific clinical information;
- make an autonomous reportability or vigilance decision;
- submit a regulatory report or initiate an FSCA; or
- replace the manufacturer's QMS, PMS plan, PRRC, or qualified regulatory
  judgment.

The complete supplier intended-use statement and customer-use template are in
[`supplier-assurance-pack.md`](supplier-assurance-pack.md).

## 2. Article 5 prohibited-practice screen

No function in the assessed scope is intended to use manipulative or subliminal
techniques, exploit protected vulnerabilities, perform social scoring, predict
criminal offending, create facial-recognition databases, infer emotions in the
regulated contexts, categorize biometric data, or perform remote biometric
identification.

This conclusion is bounded to the documented release. It must be reassessed when
features, data, intended users, or model behavior change. See
[`prohibited-practices.md`](prohibited-practices.md) for the working screen.

## 3. Article 6 high-risk assessment

### 3.1 Annex I product or safety-component route

The current intended use does not make Neuridion a medical device and does not
place it within a medical device as a safety component. It does not control a
device or make patient-specific diagnostic or therapeutic decisions. On this
basis, the present working position is that the Article 6 high-risk route tied to
an Annex I product/safety component and third-party conformity assessment is not
triggered.

[REVIEW: Counsel/QA must approve the MDR/IVDR software qualification analysis and
confirm that actual marketing, contracts, integrations, and deployed behavior do
not create a different intended purpose.]

### 3.2 Annex III use-case route

The screened document-classification use does not match an Annex III category.
In particular, it is not used for biometrics, critical-infrastructure operation,
education access, employment, access to essential public/private services, law
enforcement, migration/asylum/border control, or administration of justice and
democratic processes.

[REVIEW: Confirm against the current consolidated Annex III and any amendments
or delegated acts on the approval date.]

## 4. Working conclusion

The working conclusion is that the bounded Neuridion screening function is not a
high-risk AI system under Article 6. Do not describe this conclusion as a formal
“minimal-risk” or “limited-risk” certification.

The exact application of Article 50 depends on the deployed capability and the
provider/deployer role. Neuridion labels AI-assisted output and discloses human
oversight and limitations as governance controls. Counsel must identify any
mandatory Article 50 duty by paragraph and role rather than assuming all Article
50 provisions apply to all AI output.

This working conclusion does not remove:

- the manufacturer's MDR/IVDR and PMS obligations;
- customer validation obligations for QMS software;
- GDPR obligations where personal data is processed;
- contractual, product-liability, cybersecurity, or professional obligations;
  or
- obligations arising from the upstream model/provider relationship.

## 5. Reassessment triggers

Reassess and reapprove before release if the system is changed to:

- autonomously suppress, close, approve, or submit a regulatory decision;
- function as or within a medical device or its safety component;
- process patient-specific data for a medical purpose;
- control an authority submission or safety action without effective human
  decision-making;
- serve a use case described in Annex III;
- materially change its intended users, decision authority, models, or data; or
- operate under amended law or guidance that changes the analysis.

## 6. Approval record

| Review | Name | Evidence/decision | Date/signature |
| --- | --- | --- | --- |
| Product intended use | [ENTER] | [ENTER] | [ENTER] |
| MDR/IVDR qualification | [ENTER] | [ENTER] | [ENTER] |
| AI Act Article 6/Annex III | [ENTER] | [ENTER] | [ENTER] |
| Applicable Article 50 duties | [ENTER] | [ENTER] | [ENTER] |
| Upstream provider/deployer roles | [ENTER] | [ENTER] | [ENTER] |
| Final legal approval | [ENTER] | [APPROVE/REJECT] | [ENTER] |
