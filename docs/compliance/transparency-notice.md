# AI Transparency Notice

**Document ID:** NEUR-COMP-004
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document fulfills the transparency obligations under EU AI Act Articles 13 and 50. It provides clear, accessible information about the AI system deployed within the NEURIDION platform, enabling users to understand how AI is used, what it decides, and what remains under human control.

## 2. AI System Identity

- **System name:** NEURIDION AI Classification Pipeline
- **Function:** Automated classification of Field Safety Notices (FSNs) for relevance to user-defined medical device profiles
- **Deployer:** NEURIDION / Kodex Medical
- **AI provider:** Anthropic (Claude models via API)

## 3. Models Used

| Model | Identifier | Provider | Role | Training Data Used? |
|-------|-----------|----------|------|-------------------|
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Anthropic | Pre-filter — fast initial screening of FSNs | No — API inputs are not used for model training |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Anthropic | Full classification — detailed relevance analysis | No — API inputs are not used for model training |

**Data retention by Anthropic:** Per Anthropic's API terms, inputs sent via the API are not used to train or improve Anthropic's models. Refer to Anthropic's current data processing terms for the latest retention policy.

## 4. What the AI Decides

For each Field Safety Notice processed, the AI system produces:

- **Classification:** One of `relevant`, `uncertain`, or `excluded` with respect to the user's device profile
- **Rationale:** A text explanation of why the FSN was classified in that category
- **Confidence score:** A numerical value between 0 and 1 indicating the model's certainty in its classification

These outputs are presented to the user for review. They are **advisory only** and carry no regulatory weight without human approval.

## 5. What Humans Decide

The following decisions are made exclusively by qualified human users (PRRCs):

- **Accept or override** any AI classification — users may reclassify any FSN
- **Regulatory filings** — all compliance submissions are human-initiated and human-approved
- **PRRC sign-off** — generated reports require explicit human signature before submission to notified bodies or competent authorities
- **Device profile configuration** — users define and maintain the device profiles against which FSNs are classified
- **Search parameters** — users configure date ranges, database selections, and search terms

## 6. Known Limitations

Users should be aware of the following limitations of the AI classification system:

- **Advisory only:** AI classifications are not regulatory determinations. They are screening aids that must be validated by a qualified PRRC before any action is taken.
- **Confidence scores are estimates:** The numerical confidence values are model-generated approximations, not calibrated probabilities. They should be interpreted as relative indicators, not absolute measures of correctness.
- **Language limitations:** The AI models perform best on English-language FSNs. Classification quality may be reduced for FSNs written primarily in German, French, or other languages, particularly for technical or domain-specific terminology.
- **No access to proprietary documents:** The AI system only processes publicly available FSN data from government regulatory databases. It does not have access to proprietary manufacturer documents, internal quality records, or confidential regulatory correspondence.
- **Point-in-time analysis:** Classifications reflect the model's assessment at the time of processing and are not automatically updated if new information becomes available.

## 7. In-App Transparency

A public-facing AI transparency page is available at [`/ai-transparency`](/ai-transparency). This page provides a non-technical summary of:

- System overview and purpose
- AI models used and their roles
- Human oversight measures
- Data handling practices
- System limitations and disclaimers

This page is accessible without authentication and is intended for all stakeholders including regulators, auditors, and end users.

## 8. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
| Approved by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
