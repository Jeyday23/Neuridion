# EU AI Act Compliance Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create scanner-detectable EU AI Act compliance documents and an in-app AI transparency page to raise Kodex compliance score from 29% to ~70-80%.

**Architecture:** Two tracks — (1) seven markdown docs in `docs/compliance/` targeting Kodex scanner evidence keys by filename and content keywords, (2) a public `/ai-transparency` page, footer link, and admin AI metrics endpoint. All compliance docs use `[REVIEW: ...]` markers for regulatory judgment placeholders.

**Tech Stack:** Next.js App Router (Server Components), Supabase PostgreSQL, TypeScript, Tailwind CSS

---

### Task 1: Create compliance docs directory and index

**Files:**
- Create: `docs/compliance/README.md`

- [ ] **Step 1: Create `docs/compliance/README.md`**

```markdown
# NEURIDION Compliance Documentation

**Last updated:** 2026-05-11
**Status:** DRAFT — All documents pending regulatory review

This directory contains EU AI Act and GDPR compliance documentation for the NEURIDION AI-powered post-market surveillance platform.

## Documents

| Document | EU AI Act Reference | Status |
|----------|-------------------|--------|
| [AI System Description](ai-system-description.md) | Art. 5, Art. 52 | DRAFT |
| [Risk Assessment](risk-assessment.md) | Art. 6, Annex I, Annex III | DRAFT |
| [Human Oversight Procedures](human-oversight.md) | Art. 14 | DRAFT |
| [Transparency Notice](transparency-notice.md) | Art. 13, Art. 52 | DRAFT |
| [Prohibited Practices Screening](prohibited-practices.md) | Art. 5 | DRAFT |
| [DPIA Screening](dpia-screening.md) | GDPR Art. 35, AI Act Art. 9 | DRAFT |

## In-App Transparency

A public-facing AI transparency page is available at [`/ai-transparency`](/ai-transparency) covering system overview, models used, human oversight measures, data handling, and limitations.

## Review Process

All documents marked `[REVIEW: ...]` require input from a qualified regulatory reviewer before the DRAFT status can be removed. Technical details have been auto-generated from codebase analysis and are accurate as of the date shown.
```

- [ ] **Step 2: Commit**

```bash
git add docs/compliance/README.md
git commit -m "docs(compliance): add compliance directory index"
```

---

### Task 2: Create AI system description document

**Files:**
- Create: `docs/compliance/ai-system-description.md`

- [ ] **Step 1: Create `docs/compliance/ai-system-description.md`**

```markdown
# AI System Description

**Document ID:** NEUR-COMP-001
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document describes the AI system deployed within NEURIDION, as required for EU AI Act compliance assessment. It provides a comprehensive overview of the system's purpose, capabilities, intended users, and deployment context.

## 2. System Overview

**System name:** NEURIDION ("PMS in Seconds")
**Provider:** Neuridion
**Domain:** Medical device post-market surveillance (PMS) under EU MDR

NEURIDION is a B2B SaaS platform that automates post-market surveillance for medical device manufacturers. It searches public regulatory databases for Field Safety Notices (FSNs) and uses AI to classify each notice by relevance to a user's specific medical device profile.

## 3. AI Component

The AI component is a **document classification system** that categorizes publicly available Field Safety Notices into three categories:

- **Relevant:** The FSN concerns the user's device type, manufacturer, or intended use
- **Uncertain:** Relevance is ambiguous and requires human review by a qualified Person Responsible for Regulatory Compliance (PRRC)
- **Excluded:** The FSN is clearly unrelated to the user's device profile

Each classification includes a written rationale and a confidence score (0.0–1.0).

### AI Models

| Model | Role | Provider |
|-------|------|----------|
| Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Pre-filter triage — fast exclusion of clearly unrelated FSNs | Anthropic |
| Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Full classification — detailed analysis with rationale | Anthropic |

The two-stage pipeline reduces cost and latency: Haiku handles ~60-70% of items (clear exclusions), while Sonnet performs detailed analysis on the remainder.

## 4. Intended Users

Qualified PRRCs (Persons Responsible for Regulatory Compliance) at medical device companies operating under EU MDR. Users are expected to have domain expertise in medical device regulation and PMS obligations.

**The AI does not replace PRRC judgment.** All AI classifications are advisory and must be reviewed by a qualified professional before inclusion in any regulatory filing (Technical File, PMSR, or PSUR).

## 5. Deployment Context

- **Hosting:** Cloud SaaS on Render (US-based hosting with EU data residency considerations)
- **Database:** Supabase PostgreSQL (EU region)
- **AI API:** Anthropic API (US-based; FSN text content only — no personal data transmitted)

## 6. Data Processed by AI

**What IS sent to the AI:**
- FSN title, manufacturer name, FSN date, source URL
- FSN content text (publicly available regulatory notice content)
- Device profile context: device name, manufacturer, intended use, device class

**What is NOT sent to the AI:**
- User credentials, email addresses, or personal identifiers
- Patient data or personal health information
- Payment or billing information
- Internal company documents

All data sent to the AI consists of publicly available regulatory notices published by government agencies (BfArM, FDA MAUDE, MHRA, Swissmedic).

## 7. Data Sources

| Database | Country | Agency | Method |
|----------|---------|--------|--------|
| BfArM Kundeninfos | Germany | BfArM | Web scraper |
| FDA MAUDE | USA | FDA | REST API (openFDA) |
| MHRA Medical Device Alerts | UK | MHRA | Web scraper |
| Swissmedic FSCA | Switzerland | Swissmedic | REST API |

## 8. Article 5 — Prohibited Practices Statement

NEURIDION does not engage in any practice prohibited under EU AI Act Article 5. The system:

- Does **not** use subliminal techniques to manipulate behavior
- Does **not** exploit vulnerabilities of any specific group
- Does **not** perform social scoring of natural persons
- Does **not** assess or predict criminal risk based on profiling
- Does **not** scrape facial images for recognition databases
- Does **not** infer emotions in workplace or educational settings
- Does **not** perform biometric categorization based on sensitive attributes
- Does **not** use real-time remote biometric identification

The system classifies publicly available government regulatory documents. It does not interact with, profile, score, manipulate, or surveil any natural person.

## 9. Conclusion

NEURIDION's AI component is a document classification tool that assists qualified regulatory professionals in screening publicly available safety notices. It operates as a decision-support system with mandatory human oversight at every stage.

## 10. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
```

- [ ] **Step 2: Commit**

```bash
git add docs/compliance/ai-system-description.md
git commit -m "docs(compliance): add AI system description (NEUR-COMP-001)"
```

---

### Task 3: Create risk assessment document

**Files:**
- Create: `docs/compliance/risk-assessment.md`

- [ ] **Step 1: Create `docs/compliance/risk-assessment.md`**

```markdown
# EU AI Act Risk Classification Assessment

**Document ID:** NEUR-COMP-002
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document assesses the risk classification of NEURIDION's AI system under the EU AI Act (Regulation (EU) 2024/1689), with reference to Annex I (safety components) and Annex III (high-risk use cases). The classification determines which compliance obligations apply.

## 2. System Under Assessment

- **System:** NEURIDION AI-powered FSN classification
- **Function:** Classifies publicly available Field Safety Notices by relevance to a medical device profile
- **Users:** Qualified PRRCs at medical device manufacturers
- **Output:** Advisory classifications (relevant/uncertain/excluded) with rationale and confidence scores

## 3. Annex I Assessment — Safety Components

**Question:** Is the AI system a safety component of a product, or is it itself a product covered by EU harmonization legislation listed in Annex I?

**Determination:** **No.** NEURIDION is not a safety component of any product. It is a standalone compliance workflow tool that helps PRRCs search and screen regulatory notices. It does not control, monitor, or influence the safety of any medical device. It is not embedded in any product subject to EU harmonization legislation.

## 4. Annex III Assessment — High-Risk Use Cases

### Category 5(a): Medical Devices

**Question:** Is the AI system intended to be used as a medical device or as a safety component of a medical device, as covered by MDR (Regulation (EU) 2017/745)?

**Determination:** **No.** NEURIDION is not a medical device under MDR Article 2. It does not:
- Diagnose, treat, predict, or monitor any medical condition
- Make autonomous clinical decisions
- Process patient data
- Interact with patients or healthcare recipients
- Generate outputs used directly in clinical care

It is a **literature screening tool** used by regulatory professionals to search publicly available government databases for Field Safety Notices. This is a compliance workflow activity, not a medical device function.

### Other Annex III Categories

| Category | Description | Applicable? | Rationale |
|----------|------------|-------------|-----------|
| 1 | Biometric identification | No | System does not process biometric data |
| 2 | Critical infrastructure | No | System is a compliance tool, not infrastructure |
| 3 | Education and vocational training | No | Not applicable |
| 4 | Employment and worker management | No | Not applicable |
| 5(b) | Safety components of products | No | See Annex I assessment above |
| 6 | Law enforcement | No | Not applicable |
| 7 | Migration, asylum, border control | No | Not applicable |
| 8 | Administration of justice | No | Not applicable |

## 5. Risk Tier Conclusion

**Classification: Limited-Risk**

NEURIDION falls under the **limited-risk** category of the EU AI Act. Article 50 transparency obligations apply. The system is not prohibited (Art. 5), not high-risk (Annex I/III), and requires transparency measures to inform users that AI is involved in generating classifications.

[REVIEW: Confirm this classification is correct based on the analysis above. If the system's use case changes (e.g., outputs are used directly in clinical decision-making), this classification must be reassessed.]

## 6. Applicable Obligations

As a limited-risk AI system, NEURIDION must comply with:

- **Art. 50 (Transparency):** Users must be informed that they are interacting with AI-generated content. Implemented via in-app transparency page and report disclaimers.
- **Art. 5 (Prohibited Practices):** Universal prohibition — attestation documented in `prohibited-practices.md`.
- **General GDPR obligations:** Standard data protection requirements for the B2B SaaS platform.

## 7. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
```

- [ ] **Step 2: Commit**

```bash
git add docs/compliance/risk-assessment.md
git commit -m "docs(compliance): add risk classification assessment (NEUR-COMP-002)"
```

---

### Task 4: Create human oversight, transparency, prohibited practices, and DPIA documents

**Files:**
- Create: `docs/compliance/human-oversight.md`
- Create: `docs/compliance/transparency-notice.md`
- Create: `docs/compliance/prohibited-practices.md`
- Create: `docs/compliance/dpia-screening.md`

These four documents are shorter and follow the same template structure. They are grouped into one task for efficiency.

- [ ] **Step 1: Create `docs/compliance/human-oversight.md`**

```markdown
# Human Oversight Procedures

**Document ID:** NEUR-COMP-003
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document describes the human oversight measures implemented in NEURIDION's AI classification system, as relevant to EU AI Act Article 14 requirements. While NEURIDION is classified as limited-risk (not high-risk), these measures demonstrate responsible AI deployment.

## 2. Design Principle

NEURIDION is designed as a **human-in-the-loop** system. The AI classifies Field Safety Notices, but no classification is acted upon without human review. The system augments PRRC judgment — it does not replace it.

## 3. Oversight Mechanisms

### 3.1 Uncertain Classification Flagging

When the AI cannot determine relevance with sufficient confidence, it classifies the item as **"uncertain"** and flags it for explicit human review. The AI prompt instructs: *"Requires human review to determine PMS obligation."* These items appear in a dedicated "Requires Further Review" section in all reports.

**Code reference:** `lib/claude/filter-pipeline.ts` — the classification prompt defines "uncertain" as requiring human review.

### 3.2 Filter Failure Handling

When the AI cannot process an item (API errors, credit exhaustion, rate limits), the item is marked as **"filter_failed"** with the rationale: *"AI filter could not be applied due to API error. This item requires manual review."* Failed items are never silently dropped — they are surfaced to the user.

**Code reference:** `lib/claude/filter-pipeline.ts` — `filter_failed` decision type with mandatory manual review rationale.

### 3.3 Search Cancellation

Users can cancel any running search at any time via a dedicated cancel endpoint. This provides immediate intervention capability over the AI processing pipeline.

**Code reference:** `app/api/search-runs/[id]/cancel/route.ts`

### 3.4 Report Review and Approval

All generated PDF reports include a **"Review & Approval"** signature grid with fields for "Prepared by" and "Reviewed by." This enforces a formal sign-off step before report contents can be used in regulatory filings.

**Code reference:** `lib/pdf/report-document.tsx` — signature grid section in the report component.

### 3.5 AI Disclaimer

Every generated report includes the disclaimer: *"AI Disclaimer: Relevance assessments in this report were produced by an AI language model (Anthropic Claude) and must be reviewed and approved by a qualified PRRC before inclusion in any Technical File, PMSR, or PSUR. AI outputs do not constitute a regulatory decision."*

**Code reference:** `lib/pdf/report-document.tsx` — AI disclaimer section.

### 3.6 Immutable Audit Trail

All AI classification decisions are stored in an append-only `filter_decisions` database table. A PostgreSQL trigger prevents deletion of records. This provides a complete, tamper-resistant audit trail of all AI outputs.

**Code reference:** `supabase/migrations/050_filter_decisions_delete_trigger.sql`

### 3.7 Dashboard Review

Users review all AI classifications in the search results dashboard before generating any reports. The dashboard displays the decision, rationale, and confidence for each item, enabling informed human oversight of every AI output.

## 4. Responsible Persons

[REVIEW: Assign named individuals or roles responsible for ongoing human oversight of the AI system. Define review frequency and escalation paths.]

## 5. Conclusion

Human oversight is embedded at every stage of the NEURIDION AI pipeline: classification uncertainty triggers human review, failures surface rather than hide, reports require sign-off, and an immutable audit trail preserves all decisions.

## 6. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
```

- [ ] **Step 2: Create `docs/compliance/transparency-notice.md`**

```markdown
# AI Transparency Notice

**Document ID:** NEUR-COMP-004
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This transparency notice fulfills EU AI Act Article 13 and Article 50 obligations by informing users about how NEURIDION uses artificial intelligence, what data is processed, and what limitations apply.

## 2. AI System Identity

NEURIDION uses AI language models provided by Anthropic to classify Field Safety Notices (FSNs) retrieved from public regulatory databases. The AI is a classification tool — it does not make regulatory decisions.

## 3. Models Used

| Model | Version | Role | Provider |
|-------|---------|------|----------|
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Pre-filter triage — fast exclusion of clearly unrelated FSNs | Anthropic |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Full classification — detailed relevance analysis with rationale | Anthropic |

Anthropic's usage policy states that API inputs are not used to train models.

## 4. What the AI Decides

For each Field Safety Notice, the AI produces:
- A **classification:** relevant, uncertain, or excluded
- A **rationale:** written explanation of why the classification was assigned
- A **confidence score:** 0.0 to 1.0, indicating the model's certainty

## 5. What Humans Decide

- Whether to accept or override AI classifications
- Whether to include items in regulatory filings (Technical File, PMSR, PSUR)
- Final approval of all generated reports (PRRC sign-off required)

## 6. Known Limitations

- Confidence scores are model estimates and should not be treated as probabilities
- New or unusual device types may produce less accurate classifications
- FSNs in languages other than English or German may reduce classification quality
- The AI cannot access proprietary device documentation or internal company knowledge
- AI classifications are **advisory only** — they do not constitute regulatory decisions

## 7. In-App Transparency

A public-facing AI transparency page is available at [`/ai-transparency`](/ai-transparency) with detailed information about the AI system, human oversight measures, and data handling practices.

## 8. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
```

- [ ] **Step 3: Create `docs/compliance/prohibited-practices.md`**

```markdown
# Prohibited AI Practices Screening — Article 5

**Document ID:** NEUR-COMP-005
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document screens NEURIDION's AI system against all prohibited practices defined in EU AI Act Article 5 and provides an explicit attestation that none apply.

## 2. System Under Assessment

NEURIDION's AI classifies publicly available Field Safety Notices (government regulatory documents) by relevance to a medical device profile. It does not interact with, profile, or make decisions about natural persons.

## 3. Article 5 Screening

### 3.1 Art. 5(1)(a) — Subliminal Manipulation

**Prohibited:** AI that deploys subliminal techniques beyond a person's consciousness to materially distort behavior.

**Assessment:** Not applicable. NEURIDION classifies regulatory documents. It does not interact with individuals or attempt to influence behavior. Users are qualified regulatory professionals who review all outputs.

### 3.2 Art. 5(1)(b) — Exploitation of Vulnerabilities

**Prohibited:** AI that exploits vulnerabilities of specific groups (age, disability, social/economic situation).

**Assessment:** Not applicable. The system serves B2B professional users (PRRCs). It does not target or interact with vulnerable groups.

### 3.3 Art. 5(1)(c) — Social Scoring

**Prohibited:** AI for evaluating or classifying natural persons based on social behavior or personal characteristics.

**Assessment:** Not applicable. The system classifies government documents, not people. No social scoring of any kind occurs.

### 3.4 Art. 5(1)(d) — Criminal Risk Assessment

**Prohibited:** AI to assess the risk of natural persons committing criminal offences based on profiling.

**Assessment:** Not applicable. The system has no law enforcement function.

### 3.5 Art. 5(1)(e) — Facial Recognition Database Scraping

**Prohibited:** AI that creates or expands facial recognition databases through untargeted scraping.

**Assessment:** Not applicable. The system does not process images, facial data, or biometric data of any kind.

### 3.6 Art. 5(1)(f) — Emotion Inference in Workplace/Education

**Prohibited:** AI to infer emotions of natural persons in workplace or educational settings.

**Assessment:** Not applicable. The system does not analyze human emotions in any context.

### 3.7 Art. 5(1)(g) — Biometric Categorization

**Prohibited:** AI for biometric categorization of natural persons to deduce sensitive attributes.

**Assessment:** Not applicable. No biometric data is processed.

### 3.8 Art. 5(1)(h) — Real-Time Remote Biometric Identification

**Prohibited:** AI for real-time remote biometric identification in publicly accessible spaces for law enforcement.

**Assessment:** Not applicable. No biometric identification capability exists in the system.

## 4. Determination

**None of the Article 5 prohibited practices apply to NEURIDION.** The system classifies publicly available government regulatory documents. It does not interact with, profile, score, manipulate, identify, or surveil any natural person.

[REVIEW: Attest that this screening is complete and accurate.]

## 5. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
```

- [ ] **Step 4: Create `docs/compliance/dpia-screening.md`**

```markdown
# Data Protection Impact Assessment (DPIA) Screening

**Document ID:** NEUR-COMP-006
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document conducts a DPIA screening to determine whether a full Data Protection Impact Assessment is required under GDPR Article 35, as complemented by EU AI Act Article 9 risk management obligations.

## 2. Processing Activity Under Assessment

AI-powered classification of publicly available Field Safety Notices (FSNs) against user-defined medical device profiles.

## 3. Data Subjects Analysis

### 3.1 FSN Data (AI Input)

Field Safety Notices are **publicly available government documents** published by regulatory agencies (BfArM, FDA, MHRA, Swissmedic). They contain:
- Device/product identifiers and descriptions
- Manufacturer names (corporate entities)
- Safety issue descriptions
- Recommended corrective actions
- Publication dates and reference numbers

**These are not personal data.** They describe medical devices and safety events, not natural persons.

### 3.2 User Account Data (Not AI Input)

Standard B2B SaaS account data is processed by the platform (not sent to AI):
- Email address, full name, company name
- Device profiles (device names, EMDN codes, intended use descriptions)
- Search configurations and results
- Billing data (processed by Stripe)

### 3.3 Data Sent to AI Provider (Anthropic)

| Data Type | Sent to AI? | Personal Data? |
|-----------|-------------|----------------|
| FSN title and content | Yes | No — public government documents |
| Manufacturer names | Yes | No — corporate entities |
| Device profile (name, manufacturer, intended use) | Yes | No — product descriptions |
| User email/name/credentials | No | N/A |
| Patient data | No | N/A |
| Health data | No | N/A |

## 4. DPIA Triggering Criteria Assessment

| GDPR Art. 35 Criterion | Applicable? | Rationale |
|------------------------|-------------|-----------|
| Systematic and extensive evaluation of personal aspects (profiling) | No | System classifies documents, not people |
| Processing of special categories of data on a large scale | No | No health, biometric, or special category data processed by AI |
| Systematic monitoring of publicly accessible areas on a large scale | No | System searches regulatory databases, not public spaces |
| High-risk processing per supervisory authority list | [REVIEW: Check against applicable supervisory authority list] | May vary by jurisdiction |
| Automated decision-making with legal effects (Art. 22) | No | Classifications are advisory; no automated decisions with legal effects on natural persons |

## 5. Screening Conclusion

Based on this screening, the AI component of NEURIDION does not trigger mandatory DPIA requirements under GDPR Article 35, because:

1. The AI processes **publicly available government documents**, not personal data
2. No **special category data** (health, biometric, etc.) is processed by the AI
3. No **profiling of natural persons** occurs
4. No **automated decisions with legal effects** are made — all outputs are advisory
5. No **systematic monitoring** of publicly accessible areas occurs

[REVIEW: Based on this analysis, determine whether a full DPIA is required. Given that the AI processes only public regulatory documents and no personal/health data, a full DPIA may not be necessary. However, the standard B2B SaaS user account data processing (Supabase Auth, email, billing) may warrant a separate DPIA assessment under standard GDPR obligations — this is independent of the AI component.]

## 6. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
```

- [ ] **Step 5: Commit all four documents**

```bash
git add docs/compliance/human-oversight.md docs/compliance/transparency-notice.md docs/compliance/prohibited-practices.md docs/compliance/dpia-screening.md
git commit -m "docs(compliance): add human oversight, transparency, Art. 5, and DPIA docs"
```

---

### Task 5: Create AI transparency page

**Files:**
- Create: `app/ai-transparency/page.tsx`

- [ ] **Step 1: Create `app/ai-transparency/page.tsx`**

Follow the exact same layout pattern as `app/privacy/page.tsx`:
- `min-h-screen bg-white` wrapper
- `max-w-3xl mx-auto px-6 py-16` content container
- DRAFT banner (amber-50 with amber-200 border)
- `prose prose-zinc` content area
- Bottom navigation links

```tsx
import Link from 'next/link'

export const metadata = {
  title: 'AI Transparency — Neuridion',
  description: 'How NEURIDION uses artificial intelligence for post-market surveillance, including models, human oversight, and data handling.',
}

export default function AiTransparencyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            DRAFT — Pending regulatory review. This page will be updated as our compliance documentation is finalized.
          </p>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 mb-2">AI Transparency</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: 11 May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. AI System Overview</h2>
            <p>
              NEURIDION uses artificial intelligence to help medical device manufacturers monitor
              public regulatory databases for Field Safety Notices (FSNs). The AI classifies each
              notice by its relevance to your specific device profile.
            </p>
            <p className="mt-2">
              The AI is a <strong>classification tool</strong> — it does not make clinical decisions,
              diagnose patients, or replace the judgment of qualified regulatory professionals.
              All AI outputs are advisory and must be reviewed by a qualified Person Responsible
              for Regulatory Compliance (PRRC) before use in any regulatory filing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. Models Used</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="py-2 pr-4 text-left font-semibold text-zinc-900">Model</th>
                    <th className="py-2 pr-4 text-left font-semibold text-zinc-900">Role</th>
                    <th className="py-2 text-left font-semibold text-zinc-900">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-4">Claude Haiku 4.5</td>
                    <td className="py-2 pr-4">Pre-filter triage — fast exclusion of clearly unrelated FSNs</td>
                    <td className="py-2">Anthropic</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 pr-4">Claude Sonnet 4.6</td>
                    <td className="py-2 pr-4">Full classification — detailed relevance analysis with rationale</td>
                    <td className="py-2">Anthropic</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Anthropic&apos;s API usage policy states that API inputs are not used to train their models.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. How AI Classification Works</h2>
            <p>
              Each Field Safety Notice goes through a two-stage AI pipeline:
            </p>
            <ol className="list-decimal pl-5 space-y-2 mt-2">
              <li>
                <strong>Pre-filter (Haiku):</strong> A fast model triages each FSN and excludes
                items that are clearly unrelated to your device profile. This handles approximately
                60–70% of notices.
              </li>
              <li>
                <strong>Full classification (Sonnet):</strong> Remaining items receive detailed
                analysis. The model classifies each as <strong>relevant</strong>,
                {' '}<strong>uncertain</strong> (requires human review), or <strong>excluded</strong>.
                Each classification includes a written rationale and confidence score (0.0–1.0).
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Human Oversight Measures</h2>
            <p>NEURIDION is designed with human oversight at every stage:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong>Uncertain items:</strong> When the AI cannot determine relevance with
                confidence, it flags the item as &quot;uncertain&quot; for explicit PRRC review.
              </li>
              <li>
                <strong>Filter failures:</strong> If the AI cannot process an item (API error or
                service interruption), it is marked as &quot;requires manual review&quot; — never
                silently dropped.
              </li>
              <li>
                <strong>Search cancellation:</strong> You can cancel any running search at any time.
              </li>
              <li>
                <strong>Report approval:</strong> Every generated report includes a signature grid
                for PRRC review and sign-off before regulatory use.
              </li>
              <li>
                <strong>Audit trail:</strong> All AI classification decisions are stored in an
                immutable, append-only database record for full traceability.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Data Handling</h2>
            <h3 className="text-lg font-medium text-zinc-800 mt-4 mb-2">What is sent to the AI</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>FSN title, manufacturer name, date, and content text</li>
              <li>Your device profile context: device name, manufacturer, intended use</li>
            </ul>
            <p className="mt-2">
              All data sent to the AI consists of <strong>publicly available regulatory notices</strong>
              {' '}published by government agencies, plus your device profile description.
            </p>

            <h3 className="text-lg font-medium text-zinc-800 mt-4 mb-2">What is NOT sent to the AI</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your email address, name, or login credentials</li>
              <li>Patient data or personal health information</li>
              <li>Payment or billing information</li>
              <li>Internal company documents</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Known Limitations</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>AI classifications are <strong>advisory only</strong> — they do not constitute regulatory decisions</li>
              <li>Confidence scores are model estimates and should not be treated as probabilities</li>
              <li>New or unusual device types may produce less accurate classifications</li>
              <li>FSNs in languages other than English or German may reduce classification quality</li>
              <li>The AI cannot access proprietary device documentation or internal company knowledge</li>
              <li>All outputs must be reviewed by a qualified PRRC before inclusion in any Technical File, PMSR, or PSUR</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Prohibited Practices Statement</h2>
            <p>
              NEURIDION does not engage in any practice prohibited under EU AI Act Article 5.
              The system does not perform subliminal manipulation, exploitation of vulnerabilities,
              social scoring, real-time remote biometric identification, or any other prohibited practice.
              It classifies publicly available government regulatory documents only.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">8. Contact</h2>
            <p>
              Questions about our AI system or this transparency notice:{' '}
              <a href="mailto:info@neuridion.eu" className="text-[#0D9488] hover:underline">
                info@neuridion.eu
              </a>
            </p>
          </section>

        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 flex gap-4 text-sm">
          <Link href="/"        className="text-[#0D9488] hover:underline">&larr; Home</Link>
          <Link href="/privacy"  className="text-[#0D9488] hover:underline">Privacy</Link>
          <Link href="/terms"    className="text-[#0D9488] hover:underline">Terms</Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 3: Commit**

```bash
git add app/ai-transparency/page.tsx
git commit -m "feat: add public AI transparency page (/ai-transparency)"
```

---

### Task 6: Add AI Transparency link to footer

**Files:**
- Modify: `app/components/Footer.tsx`

- [ ] **Step 1: Add the link**

In `app/components/Footer.tsx`, add a new link between the DPA link and the Contact link. The full file after edit:

```tsx
import Link from 'next/link'

export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-zinc-200 py-5 px-6 text-center text-xs text-zinc-400 ${className}`}>
      &copy; 2026 Neuridion
      <span className="mx-2">&middot;</span>
      <Link href="/privacy"  className="hover:text-zinc-600 transition-colors">Privacy</Link>
      <span className="mx-2">&middot;</span>
      <Link href="/terms"    className="hover:text-zinc-600 transition-colors">Terms</Link>
      <span className="mx-2">&middot;</span>
      <Link href="/imprint"  className="hover:text-zinc-600 transition-colors">Imprint</Link>
      <span className="mx-2">&middot;</span>
      <Link href="/dpa"      className="hover:text-zinc-600 transition-colors">DPA</Link>
      <span className="mx-2">&middot;</span>
      <Link href="/ai-transparency" className="hover:text-zinc-600 transition-colors">AI Transparency</Link>
      <span className="mx-2">&middot;</span>
      <a href="mailto:info@neuridion.eu" className="hover:text-zinc-600 transition-colors">Contact</a>
    </footer>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 3: Commit**

```bash
git add app/components/Footer.tsx
git commit -m "feat: add AI Transparency link to footer"
```

---

### Task 7: Create admin AI metrics endpoint

**Files:**
- Create: `app/api/admin/ai-metrics/route.ts`

- [ ] **Step 1: Create `app/api/admin/ai-metrics/route.ts`**

Follow the existing admin route pattern from `app/api/admin/users/[id]/route.ts`:
- Import `checkIsAdmin` from `@/lib/admin-guard`
- Import `createAdminClient` from `@/lib/supabase/admin`
- Return 403 if not admin

```typescript
import { NextResponse } from 'next/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const caller = await checkIsAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [decisionsRes, cacheRes] = await Promise.all([
    admin
      .from('filter_decisions')
      .select('decision, confidence, model')
      .gte('created_at', thirtyDaysAgo),
    admin
      .from('filter_decision_cache')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo),
  ])

  if (decisionsRes.error) {
    console.error('[admin:ai-metrics]', decisionsRes.error.message)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }

  const rows = decisionsRes.data ?? []
  const total = rows.length

  const distribution: Record<string, number> = {
    relevant: 0,
    uncertain: 0,
    excluded: 0,
    filter_failed: 0,
  }
  const models: Record<string, number> = {}
  let confidenceSum = 0
  let confidenceCount = 0

  for (const row of rows) {
    distribution[row.decision] = (distribution[row.decision] ?? 0) + 1
    if (row.model) {
      models[row.model] = (models[row.model] ?? 0) + 1
    }
    if (row.confidence != null) {
      confidenceSum += Number(row.confidence)
      confidenceCount++
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return NextResponse.json({
    period: { from: thirtyDaysAgo.slice(0, 10), to: today },
    totalDecisions: total,
    decisionDistribution: distribution,
    averageConfidence: confidenceCount > 0
      ? Math.round((confidenceSum / confidenceCount) * 1000) / 1000
      : 0,
    filterFailureRate: total > 0
      ? Math.round(((distribution.filter_failed ?? 0) / total) * 10000) / 100
      : 0,
    modelDistribution: models,
    cacheEntries: cacheRes.count ?? 0,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/ai-metrics/route.ts
git commit -m "feat(admin): add AI metrics endpoint for compliance evidence"
```

---

### Task 8: Final verification

- [ ] **Step 1: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 2: Verify all compliance docs exist**

Run: `ls -la docs/compliance/`
Expected: 7 files — `README.md`, `ai-system-description.md`, `risk-assessment.md`, `human-oversight.md`, `transparency-notice.md`, `prohibited-practices.md`, `dpia-screening.md`

- [ ] **Step 3: Verify all docs are 500+ chars**

Run: `wc -c docs/compliance/*.md`
Expected: Each file > 500 bytes

- [ ] **Step 4: Verify git is clean**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```
