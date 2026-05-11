# Human Oversight Procedures

**Document ID:** NEUR-COMP-003
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [REVIEW: Assign qualified reviewer]

## 1. Purpose

This document describes the human oversight mechanisms implemented in the NEURIDION platform in accordance with EU AI Act Article 14. It details how the system ensures that qualified humans maintain meaningful control over AI-generated classifications at every stage of the workflow.

## 2. Design Principle

NEURIDION follows a **human-in-the-loop** design principle. The AI system operates exclusively as an advisory tool — it classifies and prioritizes Field Safety Notices but never takes autonomous regulatory action. Every AI output requires explicit human review and approval before it can influence compliance decisions or reporting.

## 3. Oversight Mechanisms

### 3.1 Uncertain Classification Flagging

When the AI model's confidence in a classification falls below the threshold or the analysis is ambiguous, the FSN is classified as `uncertain` rather than being force-fitted into `relevant` or `excluded`.

- **Implementation:** `lib/claude/filter-pipeline.ts`
- **Behavior:** The pipeline produces a three-way classification (`relevant`, `uncertain`, `excluded`) with explicit confidence scores (0-1) and textual rationale for each decision
- **User impact:** Uncertain items are prominently surfaced in the dashboard for mandatory human review, ensuring borderline cases always receive PRRC attention

### 3.2 Filter Failure Handling

If the AI filter encounters an error during classification of a specific FSN (API timeout, malformed response, rate limit exceeded), the system does not silently drop the item.

- **Behavior:** Failed items are recorded with a `filter_failed` status and a rationale explaining the failure mode
- **User impact:** The PRRC is notified that manual review is required for these items, ensuring no FSN is silently excluded due to a technical failure

### 3.3 Search Cancellation

Users can cancel an in-progress search run at any time, maintaining full control over the system's operation.

- **Implementation:** `app/api/search-runs/[id]/cancel/route.ts`
- **Behavior:** Sets the run status to `cancelled`, halting further scraping and AI classification
- **User impact:** The PRRC can stop a misconfigured or unnecessary run immediately without waiting for completion

### 3.4 Report Review and Approval

Generated PMS reports include a structured signature grid requiring explicit human sign-off before the report is considered valid.

- **Implementation:** `lib/pdf/report-document.tsx`
- **Behavior:** The report document contains designated fields for reviewer name, role, date, and signature
- **User impact:** No report can be submitted to a notified body or competent authority without documented human approval

### 3.5 AI Disclaimer

All AI-generated content in the platform is accompanied by a clear disclaimer communicating the advisory nature of the output.

- **Disclaimer text:** "AI classifications are advisory only and must be reviewed and approved by a qualified Person Responsible for Regulatory Compliance (PRRC) before any regulatory action is taken."
- **Placement:** Displayed on the search results dashboard, in generated reports, and on the AI transparency page

### 3.6 Immutable Audit Trail

All AI classification decisions are recorded in an append-only audit trail that cannot be modified or deleted, ensuring full traceability of the AI system's behavior.

- **Implementation:** The `filter_decisions` table is append-only, enforced by PostgreSQL rules that prevent UPDATE and DELETE operations
- **Behavior:** A database-level trigger rejects any attempt to modify or remove classification records
- **User impact:** Complete historical record of all AI decisions is preserved for regulatory audits, including the model used, confidence score, rationale, and timestamp

### 3.7 Dashboard Review

The search results dashboard presents all AI classifications in a structured interface that enables efficient human review.

- **Behavior:** Users can review all classified FSNs organized by decision category (relevant, uncertain, excluded), inspect individual rationales and confidence scores, and override classifications before generating reports
- **User impact:** The PRRC maintains full visibility into and control over the AI's output before any downstream action is taken

## 4. Responsible Persons

[REVIEW: Assign named individuals to the following roles]

| Role | Responsibility | Assigned To |
|------|---------------|-------------|
| AI System Owner | Overall accountability for AI system compliance | [REVIEW: Assign] |
| PRRC (per customer) | Review and approve AI classifications for their device profiles | Customer-designated PRRC |
| Technical Lead | Maintain oversight mechanisms and monitor system behavior | [REVIEW: Assign] |
| Data Protection Officer | Monitor data processing activities and GDPR compliance | [REVIEW: Assign] |

## 5. Conclusion

NEURIDION implements comprehensive human oversight mechanisms that ensure AI classifications remain advisory at all times. The system is designed so that no regulatory action can be taken based solely on AI output — every decision path requires explicit human review, validation, and approval by a qualified PRRC.

## 6. Review & Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated from codebase | 2026-05-11 | — |
| Reviewed by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
| Approved by | [REVIEW: Assign] | [REVIEW: Date] | [REVIEW: Sign] |
