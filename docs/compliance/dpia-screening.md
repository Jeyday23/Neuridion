# DPIA Screening

**Document ID:** NEUR-COMP-006
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document screens the NEURIDION platform's AI processing activities against GDPR Article 35 criteria and EU AI Act Article 9 data governance requirements to determine whether a full Data Protection Impact Assessment (DPIA) is required.

## 2. Processing Activity

- **System:** NEURIDION AI Classification Pipeline
- **Processing description:** The system sends publicly available Field Safety Notice (FSN) data and user-defined device profile metadata to the Anthropic API for relevance classification. The AI models return classification decisions (relevant/uncertain/excluded), confidence scores, and textual rationales.
- **Data controller:** NEURIDION / Kodex Medical
- **Data processor:** Anthropic (for AI classification via API)
- **Legal basis:** Legitimate interest (B2B regulatory compliance tool) and contract performance

## 3. Data Subjects Analysis

### 3.1 FSN Data — Public Regulatory Documents

Field Safety Notices are **publicly available government documents** published by regulatory authorities (BfArM, FDA, MHRA, Swissmedic). They contain information about medical device safety issues, manufacturer names, and corrective actions.

FSN data is **not personal data** under GDPR Article 4(1). These are official regulatory publications that do not identify or relate to natural persons. They describe products, manufacturers (legal entities), and safety events.

### 3.2 User Account Data — Standard B2B Credentials

User account data (email, name, company) is standard B2B SaaS account information. This data is:

- Processed for account management and service delivery
- Stored in Supabase PostgreSQL (EU region)
- **Not sent to the AI models** — the classification pipeline receives only FSN content and device profile metadata

### 3.3 Data Sent to AI Models

| Data Element | Sent to AI? | Personal Data? | Special Category? |
|-------------|-------------|----------------|-------------------|
| FSN title | Yes | No — public regulatory document | No |
| FSN content | Yes | No — public regulatory document | No |
| FSN manufacturer | Yes | No — legal entity name | No |
| FSN date | Yes | No — publication date | No |
| Device profile (name, manufacturer, intended use) | Yes | No — product metadata | No |
| User email | No | Yes — but not sent to AI | No |
| User credentials | No | Yes — but not sent to AI | No |
| Patient data | No — never collected | N/A | N/A |
| Health data | No — never collected | N/A | N/A |
| Billing information | No | Yes — but not sent to AI | No |

## 4. DPIA Triggering Criteria

The following table evaluates the NEURIDION AI processing against the criteria that trigger a mandatory DPIA under GDPR Article 35(3) and WP29 Guidelines:

| Criterion | Triggered? | Rationale |
|-----------|-----------|-----------|
| Systematic and extensive profiling with significant effects | No | System classifies documents, not individuals. No profiling of natural persons occurs. |
| Large-scale processing of special categories (Art. 9) | No | No special category data is processed. FSNs are public regulatory documents. No health, biometric, genetic, or other Art. 9 data is involved. |
| Systematic monitoring of a publicly accessible area | No | System monitors government regulatory databases (document repositories), not physical spaces or individuals. |
| Processing is on a supervisory authority's mandatory DPIA list | [REVIEW: Check against the mandatory DPIA lists published by relevant supervisory authorities (e.g., BfDI Germany, ICO UK, EDPB guidelines)] | Must be verified against current lists. |
| Automated decision-making with legal or similarly significant effects (Art. 22) | No | AI classifications are advisory only. No automated decision produces legal effects or similarly significant effects on natural persons. All decisions require human PRRC review and approval. |

## 5. Screening Conclusion

Based on the analysis above, a full DPIA is **not triggered** for the following reasons:

1. **No personal data is sent to AI models.** The classification pipeline processes only publicly available regulatory documents (FSNs) and user-provided product metadata. Neither category constitutes personal data under GDPR Article 4(1).

2. **No special category data is processed.** The system does not collect, store, or process health data, biometric data, genetic data, or any other special category data defined in GDPR Article 9.

3. **No profiling of natural persons occurs.** The AI system classifies regulatory documents about medical devices, not individuals. It does not build profiles of, score, or evaluate any natural person.

4. **No automated decisions with legal effects.** All AI classifications are advisory and require explicit human review and approval by a qualified PRRC before any regulatory action is taken. The system does not make decisions that produce legal effects or similarly significant effects on individuals.

5. **Data subjects are limited to B2B users.** The only personal data processed (account credentials, email) is standard B2B SaaS data that is not sent to AI models and is processed under standard contract performance and legitimate interest bases.

[REVIEW: Determine whether a full DPIA is nevertheless advisable as a matter of best practice, particularly considering: (a) the cross-border data transfer to Anthropic's US-based API, (b) any updates to supervisory authority mandatory DPIA lists, and (c) the evolving regulatory interpretation of AI-assisted processing under the AI Act. If a full DPIA is determined to be required or advisable, initiate the assessment process per the organisation's DPIA procedure.]

## 6. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
| Approved by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
