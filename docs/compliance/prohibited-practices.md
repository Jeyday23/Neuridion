# Draft Prohibited AI Practices Screen — Article 5

**Document ID:** NEUR-COMP-005  
**Version:** 0.2-draft  
**Date:** 2026-08-31  
**Status:** DRAFT — counsel and qualified QA/RA approval required  
**Release/build assessed:** [ENTER]

> This is a bounded product screen, not a legal opinion or certification. It
> must be checked against the current consolidated law, guidance, deployed
> functionality, intended use, data and commercial practices before approval.

## 1. Assessed intended use

Neuridion assists qualified medical-device quality and regulatory personnel in
screening public safety records against a manufacturer-defined device profile.
It produces advisory relevance output for human disposition and does not act on
natural persons, control medical devices or take autonomous regulatory action.

## 2. Working Article 5 screen

| Practice screened | Present working assessment | Release evidence/review required |
| --- | --- | --- |
| Harmful manipulation or subliminal techniques | Not part of the documented screening purpose | Review interface, prompts, sales practices and experiments |
| Harmful exploitation of vulnerabilities | Not part of the documented screening purpose | Confirm no targeting/adaptation based on age, disability or socioeconomic vulnerability |
| Social scoring | System classifies safety records, not people | Confirm no user/person scoring feature or downstream reuse |
| Criminal-offence risk prediction based on profiling | No criminal-justice purpose | Confirm no integrations or repurposing |
| Untargeted facial-image scraping for recognition databases | No facial-recognition function | Confirm no image ingestion/model capability added |
| Emotion inference in regulated contexts | No emotion-inference function | Confirm no voice/image/behavior analytics added |
| Biometric categorization of sensitive characteristics | No biometric categorization function | Confirm no biometric fields or model path added |
| Real-time remote biometric identification for law enforcement | No biometric or law-enforcement function | Confirm no deployment/integration changes |

The working conclusion is that no screened prohibited practice is intended or
implemented within the bounded release. Do not generalize this conclusion to
future features, customer misuse, sales conduct, an upstream provider's separate
systems or a differently configured deployment.

## 3. Required release evidence

- approved intended-use and prohibited-use statement;
- model, prompt/ruleset, input and output inventory;
- current UI and user-journey review;
- data-field and integration inventory;
- subprocessor/upstream-provider review;
- marketing and sales-claim review;
- abuse/misuse monitoring and incident route; and
- change-impact record confirming whether reassessment was triggered.

## 4. Reassessment triggers

Reassess before release when functionality adds or materially changes:

- decision-making about natural persons;
- biometrics, image, audio, emotion or behavior analysis;
- personalization based on protected or vulnerable characteristics;
- workforce, education, essential-service, law-enforcement or public-authority
  use;
- persuasive, ranking, scoring or recommender behavior;
- customer-facing autonomous action; or
- intended use, data sources, models, integrations or applicable law.

## 5. Approval

| Review | Name | Decision/evidence | Date/signature |
| --- | --- | --- | --- |
| Technical feature/data inventory | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Product/marketing scope | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| QA/RA assessment | [ENTER] | [APPROVE/REJECT] | [ENTER] |
| Legal Article 5 review | [ENTER] | [APPROVE/REJECT] | [ENTER] |
