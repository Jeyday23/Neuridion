# EU AI Act Risk Classification Assessment

**Document ID:** NEUR-COMP-002
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document assesses the risk classification of the NEURIDION AI system under the EU AI Act (Regulation (EU) 2024/1689), specifically Articles 6, Annex I, and Annex III. The assessment determines which tier of obligations applies to the system.

## 2. System Under Assessment

- **System name:** NEURIDION ("PMS in Seconds")
- **AI function:** Document classification of Field Safety Notices against device profiles
- **Models:** Claude Haiku 4.5 (pre-filter), Claude Sonnet 4.6 (full classification)
- **Provider:** Anthropic (API-based)
- **Deployer:** NEURIDION / Kodex Medical
- **Users:** Qualified PRRCs at medical device manufacturers

## 3. Annex I Assessment — Safety Component Analysis

**Question:** Is the AI system a safety component of a product, or is it itself a product, covered by Union harmonisation legislation listed in Annex I?

**Assessment:** The NEURIDION AI system is **NOT a safety component** of a medical device or any product listed in Annex I. It is a literature screening and classification tool that assists human reviewers in identifying potentially relevant regulatory notices. It does not:

- Control or influence the operation of any medical device
- Make safety-critical decisions autonomously
- Form part of any product's safety function
- Replace any required safety mechanism

The system's output is advisory only and requires mandatory human review before any action is taken.

## 4. Annex III Assessment — High-Risk Category Screening

Annex III defines eight categories of high-risk AI systems. The following table evaluates each:

| # | Category | Applicable? | Rationale |
|---|----------|-------------|-----------|
| 1 | Biometric identification and categorisation | No | System does not process biometric data of any kind |
| 2 | Management and operation of critical infrastructure | No | System is a SaaS document screening tool, not critical infrastructure |
| 3 | Education and vocational training | No | System has no educational function |
| 4 | Employment, workers management | No | System does not assess workers or make employment decisions |
| 5a | Access to essential services — Medical devices | No | See detailed analysis below |
| 5b | Access to essential services — Creditworthiness | No | System does not assess creditworthiness |
| 6 | Law enforcement | No | System has no law enforcement function |
| 7 | Migration, asylum and border control | No | System has no immigration-related function |
| 8 | Administration of justice and democratic processes | No | System has no judicial or democratic function |

### 4.1 Category 5a — Medical Devices: Detailed Analysis

Category 5a covers AI systems intended to be used as a safety component of a medical device, or which are themselves medical devices, as covered by MDR (EU) 2017/745 or IVDR (EU) 2017/746.

**NEURIDION is NOT a medical device under MDR Article 2** because it:

- Does **not** diagnose, prevent, monitor, predict, or treat any disease or medical condition
- Does **not** investigate, replace, or modify anatomy or any physiological/pathological process
- Does **not** provide information by means of in vitro examination of specimens derived from the human body
- Is a **literature screening tool** that classifies publicly available regulatory documents (FSNs) for relevance to a user-defined device profile
- Produces **advisory output only** that must be reviewed and approved by a qualified PRRC

The system operates entirely on publicly available government regulatory data and user-provided device metadata. It has no patient interaction, no clinical function, and no diagnostic or therapeutic purpose.

[REVIEW: Confirm this classification with reference to national competent authority guidance and any applicable case law regarding AI-assisted regulatory tools under MDR]

## 5. Risk Tier Conclusion

Based on the analysis above, the NEURIDION AI system is classified as **Limited-Risk** under the EU AI Act.

The system does not meet the criteria for:
- **Unacceptable risk** (Art. 5) — No prohibited practices apply (see NEUR-COMP-005)
- **High-risk** (Art. 6, Annex I, Annex III) — Not a safety component, not a medical device, does not fall within any Annex III category

As a limited-risk AI system, NEURIDION is subject to **Article 50 transparency obligations**.

[REVIEW: Confirm this classification is consistent with the latest Commission guidance and any delegated acts amending Annexes I or III]

## 6. Applicable Obligations

Given the limited-risk classification, the following obligations apply:

### 6.1 Article 50 — Transparency Obligations
- Users must be informed that they are interacting with an AI system
- AI-generated classifications must be clearly identified as AI output
- Limitations and confidence levels must be communicated
- See NEUR-COMP-004 (Transparency Notice) for implementation details

### 6.2 Article 5 — Prohibited Practices
- Ongoing screening required to confirm no prohibited practices are introduced
- See NEUR-COMP-005 (Prohibited Practices Screening) for current assessment

### 6.3 General GDPR Obligations
- Standard data protection requirements apply to user account data
- AI processing of FSN data (public regulatory documents) does not constitute processing of personal data
- See NEUR-COMP-006 (DPIA Screening) for data protection impact assessment

## 7. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
| Approved by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
