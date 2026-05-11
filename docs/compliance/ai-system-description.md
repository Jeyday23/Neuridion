# AI System Description

**Document ID:** NEUR-COMP-001
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document describes the AI system deployed within the NEURIDION platform in accordance with EU AI Act Articles 5 and 52. It provides a complete account of the system's function, intended use, data flows, and deployment context to support regulatory classification and transparency obligations.

## 2. System Overview

NEURIDION ("PMS in Seconds") is a B2B SaaS platform that performs post-market surveillance (PMS) under EU Medical Device Regulation (MDR) 2017/745. The platform monitors regulatory databases for Field Safety Notices (FSNs), applies AI-powered relevance filtering against user-defined device profiles, and generates compliance reports for qualified Persons Responsible for Regulatory Compliance (PRRCs).

## 3. AI Component

### 3.1 Function

The AI component performs **document classification** of FSNs retrieved from regulatory databases. For each FSN, the system produces:

- **Classification decision:** `relevant`, `uncertain`, or `excluded` with respect to the user's device profile
- **Confidence score:** A value between 0 and 1 indicating the model's certainty
- **Rationale:** A text explanation of the classification reasoning

### 3.2 Models Used

| Model | Identifier | Provider | Role |
|-------|-----------|----------|------|
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Anthropic | Pre-filter — fast initial screening |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Anthropic | Full classification — detailed analysis |

Both models are accessed via the Anthropic API. The pipeline is implemented in `lib/claude/filter-pipeline.ts` with rate limiting via `lib/claude/rate-limiter.ts`.

## 4. Intended Users

The system is intended for use by **qualified Persons Responsible for Regulatory Compliance (PRRCs)** as defined under EU MDR Article 15. Users are expected to have domain expertise in medical device regulation and post-market surveillance.

**Critical limitation:** The AI component does NOT replace PRRC judgment. All AI classifications are advisory and must be reviewed, validated, and approved by a qualified PRRC before any regulatory filing or compliance action is taken.

## 5. Deployment Context

| Component | Location | Provider |
|-----------|----------|----------|
| Application hosting | Cloud | Render |
| Database (PostgreSQL) | EU region | Supabase |
| AI API | US region | Anthropic |

Data transmitted to the Anthropic API traverses from the EU-hosted application to US-based Anthropic servers. See Section 6 for details on what data is and is not transmitted.

## 6. Data Processed

### 6.1 Data Sent to AI Models

The following data is sent to the Anthropic API for classification:

- FSN title
- FSN manufacturer name
- FSN date
- FSN content (raw text from regulatory databases)
- Device profile (device name, manufacturer, intended use, EMDN code, device class)

### 6.2 Data NOT Sent to AI Models

The following categories of data are **never** transmitted to Anthropic:

- User credentials (passwords, tokens, API keys)
- Patient data of any kind
- Protected health information (PHI)
- Billing or payment information
- User email addresses or personal identifiers

## 7. Data Sources

| Source | Country | Method | Module |
|--------|---------|--------|--------|
| BfArM Kundeninfos | Germany | HTML scraper (portal pagination) | `lib/scrapers/bfarm.ts` |
| FDA MAUDE | USA | openFDA REST API | `lib/scrapers/fda-maude.ts` |
| MHRA Medical Device Alerts | UK | HTML scraper (GOV.UK portal) | `lib/scrapers/mhra.ts` |
| Swissmedic FSCA | Switzerland | REST API | `lib/scrapers/swissmedic.ts` |

All data sources are publicly accessible government regulatory databases. No proprietary or restricted data sources are used.

## 8. Article 5 — Prohibited Practices Statement

The NEURIDION AI system does **NOT** perform any of the following:

- **Subliminal manipulation:** No techniques that materially distort behavior beyond conscious awareness
- **Exploitation of vulnerabilities:** No targeting of age, disability, or social/economic situation
- **Social scoring:** No evaluation of individuals based on social behavior or personal characteristics
- **Criminal risk assessment:** No prediction of criminal offending based on profiling or personality traits
- **Facial recognition:** No scraping or use of facial images from any source
- **Emotion inference:** No detection or inference of emotions in any context
- **Biometric categorization:** No categorization of individuals by biometric data
- **Real-time biometric identification:** No real-time remote biometric identification in public spaces

The system processes only publicly available regulatory documents (FSNs) and user-provided device profile metadata. It has no access to biometric data, personal characteristics, or individual behavior patterns.

## 9. Conclusion

NEURIDION's AI component is a narrowly scoped document classification system that assists qualified regulatory professionals in screening publicly available field safety notices. It operates as an advisory tool with mandatory human oversight at every decision point.

## 10. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
| Approved by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
