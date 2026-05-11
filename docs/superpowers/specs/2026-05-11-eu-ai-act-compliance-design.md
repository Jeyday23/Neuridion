# EU AI Act Compliance Remediation — Design Spec

**Date:** 2026-05-11
**Status:** Approved

## Goal

Raise NEURIDION's Kodex EU AI Act compliance score from 29% to ~70-80% by creating scanner-detectable compliance documents and an in-app AI transparency page. Technical details auto-filled from codebase; regulatory judgment calls marked with `[ROBERT: ...]` for co-founder review.

## Problem

A Kodex EU AI Act scan found 29% compliance (1 pass, 2 partial, 4 needs attention out of 7 controls). The score is misleadingly low because the scanner applies high-risk requirements uniformly. Council analysis determined NEURIDION is **limited-risk** (not high-risk) — it's a B2B document classification tool for qualified PRRCs, not a medical device or clinical decision system. The system already has human oversight mechanisms in code (uncertain flagging, filter_failed manual review, cancel endpoint, PRRC signature grid, append-only audit trail, AI disclaimer in reports) but none of this is documented in scanner-discoverable artifacts.

## Scanner Detection Model

The Kodex scanner:
1. Enumerates files by path/name pattern (e.g., `dpia.md`, `risk-assessment.md`)
2. Reads content to confirm relevance (keyword density, heading structure, char count)
3. Maps findings to evidence keys: `dpia_document`, `risk_assessment_doc`, `q_human_oversight`, `oversight_procedures`, `q_prohibited_practices`, `ai_system_description`, `transparency_notice`, `user_documentation`
4. Already VERIFIED: `technical_documentation` (README + 26 docs) and `testing_procedures` (CI/CD workflow)

## Solution

Two tracks executed together:

### Track 1: Compliance Documents (`docs/compliance/`)

Seven files in `docs/compliance/`, each 500+ chars with scanner-targeted filenames and keyword-rich headings.

| File | Evidence Key | EU AI Act Article | Content |
|------|-------------|-------------------|---------|
| `README.md` | — | — | Index linking all compliance docs |
| `ai-system-description.md` | `ai_system_description` | Art. 5 | System purpose, AI capabilities, data processed, deployment context |
| `risk-assessment.md` | `risk_assessment_doc`, `q_risk_classification` | Art. 6 | Annex I/III analysis, limited-risk determination with rationale |
| `human-oversight.md` | `q_human_oversight`, `oversight_procedures` | Art. 14 | Documents all existing code mechanisms |
| `transparency-notice.md` | `transparency_notice` | Art. 13 | Models used, AI vs. human roles, limitations, link to in-app page |
| `prohibited-practices.md` | `q_prohibited_practices` | Art. 5 | Attestation: no social scoring, manipulation, biometric surveillance |
| `dpia-screening.md` | `dpia_document` | GDPR Art. 35 / AI Act Art. 9 | DPIA necessity screening — system processes public regulatory data, not personal/health data |

#### Document Template Structure

Every document follows this structure for scanner keyword detection:

```markdown
# [Document Title]

**Document ID:** [e.g., NEUR-COMP-001]
**Date:** 2026-05-11
**Status:** DRAFT — Pending regulatory review
**Author:** Auto-generated from codebase analysis
**Reviewer:** [ROBERT: Assign qualified reviewer]

## 1. Purpose
[Why this document exists, which EU AI Act article it addresses]

## 2-N. [Control-specific sections]
[Substantive content with relevant keywords]

## N+1. Conclusion
[Summary determination]

## N+2. Review & Approval
| Role | Name | Date | Signature |
|------|------|------|-----------|
| Prepared by | Auto-generated | 2026-05-11 | — |
| Reviewed by | [ROBERT: Assign] | [ROBERT: Date] | [ROBERT: Sign] |
```

### Track 2: In-App AI Transparency Page

**File:** `app/ai-transparency/page.tsx`

Public page (no auth), Server Component. Follows existing page patterns (`privacy/page.tsx`, `terms/page.tsx`) — same `max-w-3xl mx-auto px-6 py-16` layout with DRAFT banner.

#### Sections

1. **AI System Overview** — NEURIDION uses AI to classify Field Safety Notices. It does not make clinical decisions, diagnose patients, or replace regulatory judgment.
2. **Models Used** — Claude Haiku 4.5 (pre-filter triage), Claude Sonnet 4.6 (full classification). Provider: Anthropic. Data not used for model training.
3. **How AI Classification Works** — Two-stage pipeline: Haiku pre-filter excludes clear non-matches, Sonnet classifies remainder as relevant/uncertain/excluded. Each decision includes rationale and confidence score.
4. **Human Oversight Measures** — Uncertain items flagged for manual PRRC review. Filter failures surface with "manual review required". Users can cancel running searches. Reports require PRRC sign-off (signature grid). All decisions stored in append-only audit trail.
5. **Data Handling** — What is sent to AI: FSN title, manufacturer, date, content text, device profile (name, manufacturer, intended use). What is NOT sent: user credentials, patient data, personal health information.
6. **Known Limitations** — AI classifications are advisory. Confidence scores may vary. New device types or unusual FSN formats may reduce accuracy. All outputs must be reviewed by a qualified PRRC before inclusion in regulatory filings.
7. **Prohibited Practices Statement** — NEURIDION does not engage in: subliminal manipulation, exploitation of vulnerabilities, social scoring, real-time remote biometric identification, or any other practice prohibited under EU AI Act Article 5.
8. **Contact** — Questions: info@neuridion.eu

#### Metadata

```typescript
export const metadata = {
  title: 'AI Transparency — Neuridion',
  description: 'How NEURIDION uses artificial intelligence for post-market surveillance, including models, human oversight, and data handling.',
}
```

### Track 3: Footer Update

Add "AI Transparency" link to `app/components/Footer.tsx`, positioned between DPA and Contact:

```
Privacy · Terms · Imprint · DPA · AI Transparency · Contact
```

### Track 4: AI Metrics Endpoint

**File:** `app/api/admin/ai-metrics/route.ts`

Admin-only GET endpoint. Uses `createAdminClient()` + existing admin guard pattern.

#### Response Shape

```typescript
interface AiMetrics {
  period: { from: string; to: string }  // last 30 days
  totalDecisions: number
  decisionDistribution: {
    relevant: number
    uncertain: number
    excluded: number
    filter_failed: number
  }
  averageConfidence: number             // 0-1
  filterFailureRate: number             // percentage
  modelDistribution: Record<string, number>  // model name -> count
  cacheHitRate: number                  // percentage from filter_decision_cache
}
```

#### Queries

```sql
-- Decision distribution (last 30 days)
SELECT decision, COUNT(*) as count, AVG(confidence) as avg_confidence
FROM filter_decisions
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY decision;

-- Model distribution
SELECT model, COUNT(*) as count
FROM filter_decisions
WHERE created_at >= NOW() - INTERVAL '30 days' AND model IS NOT NULL
GROUP BY model;

-- Cache stats
SELECT COUNT(*) as cache_entries
FROM filter_decision_cache
WHERE created_at >= NOW() - INTERVAL '30 days';
```

## Document Content Specifications

### `ai-system-description.md`
- **System name:** NEURIDION ("PMS in Seconds")
- **Provider:** Neuridion (Jeremiah + Robert Friedrich, COPRA System GmbH)
- **Purpose:** Automated post-market surveillance for medical device manufacturers under EU MDR
- **AI component:** FSN relevance classification using Anthropic Claude models
- **Intended users:** Qualified PRRCs at medical device companies
- **Deployment:** Cloud SaaS (Render), Supabase PostgreSQL backend
- **Data processed:** Publicly available regulatory notices from BfArM, FDA MAUDE, MHRA, Swissmedic
- **Art. 5 attestation:** The system does not engage in any prohibited practice. It classifies public government documents — it does not profile, score, manipulate, or surveil individuals.

### `risk-assessment.md`
- **Analysis scope:** EU AI Act Annex I (safety components) and Annex III (high-risk use cases)
- **Annex I determination:** NEURIDION is not a safety component of a product. It is a compliance workflow tool.
- **Annex III determination:** Category 5(a) (medical devices) does NOT apply — NEURIDION is not itself a medical device under MDR Article 2. It is a literature screening tool used by professionals to search publicly available databases. It does not diagnose, treat, predict, or make autonomous clinical decisions.
- **Risk tier conclusion:** Limited-risk (Art. 50 transparency obligations apply). [ROBERT: Review and confirm this classification]
- **Rationale:** The AI augments human PRRC judgment by triaging document relevance. All classifications are advisory and require human review before regulatory use. The system processes public regulatory notices, not patient data.

### `human-oversight.md`
- **Uncertain classification:** AI flags items as "uncertain" when relevance is ambiguous — these require explicit PRRC review
- **Filter failure handling:** When AI cannot classify (API error, credit exhaustion), items are marked `filter_failed` with "manual review required"
- **Search cancellation:** Users can cancel running searches at any time via cancel endpoint
- **Report approval:** PDF reports include a "Prepared by / Reviewed by" signature grid — PRRC must sign off
- **AI disclaimer:** Every report states: "must be reviewed and approved by a qualified PRRC before inclusion in any Technical File, PMSR, or PSUR"
- **Audit trail:** `filter_decisions` table is append-only (PostgreSQL trigger prevents deletion). `audit_log` table tracks all security events. Both are immutable.
- **Override capability:** Users review all AI classifications in the dashboard before generating reports. No classification is acted upon without human review.

### `transparency-notice.md`
- **AI models:** Claude Haiku 4.5 (pre-filter), Claude Sonnet 4.6 (full classification). Provider: Anthropic.
- **What AI decides:** Classifies each FSN as relevant, uncertain, or excluded relative to a device profile. Provides rationale and confidence score (0-1).
- **What humans decide:** Which classifications to accept. Whether to include items in regulatory filings. Final PRRC approval of all reports.
- **Limitations:** Confidence scores are model estimates. New device types may reduce accuracy. AI cannot replace regulatory expertise.
- **In-app transparency:** Link to `/ai-transparency` page.

### `prohibited-practices.md`
- **Scope:** Full screening against all EU AI Act Article 5 categories
- **Categories assessed:** (a) subliminal manipulation, (b) exploitation of vulnerabilities, (c) social scoring, (d) criminal risk assessment from profiling, (e) facial recognition database scraping, (f) emotion inference in workplace/education, (g) biometric categorization, (h) real-time remote biometric identification
- **Determination:** None apply. The system classifies publicly available government regulatory documents. It does not interact with, profile, score, manipulate, or surveil any natural person. [ROBERT: Review and attest]

### `dpia-screening.md`
- **Processing activity:** AI classification of publicly available FSN documents against user-defined device profiles
- **Data subjects:** None in the traditional sense — FSNs are public government notices about medical devices, not personal data about individuals. User data (email, company, device profiles) is standard B2B SaaS account data.
- **Personal data processed by AI:** None. FSN text, manufacturer names, and device descriptions are sent to Anthropic API. No user credentials, email addresses, or personal identifiers are included in AI prompts.
- **Sensitive data:** None. No health data, biometric data, or special category data is processed by the AI component.
- **Screening conclusion:** [ROBERT: Based on this analysis, determine whether a full DPIA is required. Given that the AI processes only public regulatory documents and no personal/health data, a full DPIA may not be necessary. However, the user account data processing (Supabase Auth) may warrant a separate DPIA assessment under standard GDPR obligations.]

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `docs/compliance/README.md` | Index linking all compliance docs |
| Create | `docs/compliance/ai-system-description.md` | AI system purpose, scope, Art. 5 context |
| Create | `docs/compliance/risk-assessment.md` | Annex I/III analysis, limited-risk determination |
| Create | `docs/compliance/human-oversight.md` | Documents existing oversight mechanisms |
| Create | `docs/compliance/transparency-notice.md` | Models, AI vs. human roles, limitations |
| Create | `docs/compliance/prohibited-practices.md` | Art. 5 screening and attestation |
| Create | `docs/compliance/dpia-screening.md` | DPIA necessity assessment |
| Create | `app/ai-transparency/page.tsx` | Public AI transparency page |
| Modify | `app/components/Footer.tsx` | Add "AI Transparency" link |
| Create | `app/api/admin/ai-metrics/route.ts` | Admin AI performance metrics endpoint |

## What Stays Unchanged

- Filter pipeline code (`lib/claude/filter-pipeline.ts`)
- PDF report AI disclaimer (`lib/pdf/report-document.tsx`)
- Database schema — no new tables or migrations
- Privacy/terms pages — separate concern
- Existing admin pages

## What Robert Needs To Do After

1. Review all 6 compliance docs, fill `[ROBERT: ...]` placeholders
2. Confirm or adjust the limited-risk classification in `risk-assessment.md`
3. Attest to Art. 5 prohibited practices screening in `prohibited-practices.md`
4. Determine if full DPIA is required based on `dpia-screening.md`
5. Assign named PRRC reviewers for human oversight procedures
6. Remove DRAFT status from finalized docs

## Non-Goals

- No ISO 13485 QMS certification (long-term, outside engineering scope)
- No changes to AI filter pipeline logic
- No new database tables
- No accuracy benchmarking framework (future work)
- No changes to existing privacy/terms pages
