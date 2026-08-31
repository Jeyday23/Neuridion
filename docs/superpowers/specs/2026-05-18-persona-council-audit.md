# Neuridion Persona Council Audit — 18 May 2026

## Council Members

| Persona | Role | Company | Verdict |
|---------|------|---------|---------|
| Dr. Anna Weber | PRRC (8yr EU MDR) | Mid-size German manufacturer, Class IIa | **Watch list Q3 2026** (3.8/5) |
| Michael Hartmann | Head of QM | 15-person German startup, Class I/IIa | **Wait, leaning BUY** (4/5) |
| Sarah Chen | CTO/Co-founder | US startup expanding to EU, Class II cardiac | **Bookmark for public launch** (3.5/5) |

---

## Consensus: What's Working

### Sample Report — Unanimous Strongest Asset (4.5–5/5)
All three personas rated the sample report as the best page on the site. Key praise:
- Audit-ready document structure (methodology, results, appendix, signature blocks)
- AI classification rationales read like a competent RA professional wrote them
- "Uncertain" items correctly flagged for PRRC review rather than silently decided
- Excluded items appendix demonstrates completeness for auditors
- Word/PDF/Excel export options match real QMS workflows
- AI disclaimer correctly worded for regulatory defensibility

### FAQ — Unanimous Excellent (4–5/5)
- Honest about what Neuridion does NOT cover (literature, complaints, registry data)
- GAMP 5 Category 5 recommendation shows QMS integration knowledge
- "PRRC must review every decision" — the right message, prominently placed
- 10-year retention citing EU MDR Art. 10(8) — regulatory-aware
- AI data handling explanation builds trust

### Domain Knowledge — All Three Noticed
Every persona independently noted that the product demonstrates genuine regulatory domain expertise — not typical for SaaS tools in MedTech. The FSN card examples, classification rationales, and PRRC review gate concept all signal real-world PMS experience.

---

## Consensus: Blockers (All Three Flagged)

### 1. Broken Legal Pages — HARD BLOCKER
- `/terms` redirects to `/signup` — users cannot read Terms of Service
- `/dpa` redirects to `/signup` — Data Processing Agreement inaccessible
- `/imprint` redirects to `/login` — German TMG §5 legal requirement
- **Impact:** All three personas said they would NOT sign up without readable legal documents
- **Fix:** Check proxy.ts public route list — these paths are likely missing

### 2. DRAFT Labels on Legal Documents — HARD BLOCKER
- Privacy Policy shows "DRAFT — Pending legal review"
- AI Transparency shows "DRAFT" label
- Company address is "[TO BE ADDED]" in privacy policy
- **Impact:** PRRC: "disqualifying for vendor qualification." QM: "yellow flag." Founder: "signals company isn't ready."
- **Fix:** Either finalize with legal counsel or remove DRAFT labels if content is final

### 3. PRRC Acronym Never Defined — MEDIUM
- Homepage uses "PRRC" multiple times without defining it
- Footer tagline "Built for PRRCs" alienates non-experts
- **Impact:** Founder: "signals this tool is for regulatory experts, not for me"
- **Fix:** Add "(Person Responsible for Regulatory Compliance)" on first use + glossary

---

## Consensus: Missing Features (Priority Order)

### P0 — Required Before Production Use
1. **Multi-user/role support** — PRRC reviews, RA assistant runs searches. No visible multi-seat option.
2. **Finalized legal documents** — Terms, DPA, Imprint, Privacy all need to be production-ready.
3. **Annual pricing** — FAQ mentions it but pricing page doesn't show it. B2B standard.

### P1 — Required for Serious Adoption
4. **Trend analysis across runs** — PSUR requires trend data. Currently per-run snapshots only.
5. **Scientific literature monitoring** — EU MDR Art. 83(3) requires it. FSN-only is a partial solution.
6. **Mid-tier pricing** — Gap from €199 → €599 is too steep. Need ~€349 for 5 profiles.
7. **Demo/phone option** — B2B buyers at €199-599/month expect to talk to a human.
8. **Data export/portability guarantee** — What happens if Neuridion shuts down?

### P2 — Competitive Advantages
9. **EU MDR onboarding guide** — "Getting Started with PMS" for newcomers
10. **Glossary** — Define FSN, FSCA, PRRC, PMS, PSUR, EMDN for non-experts
11. **AI model version in reports** — For reproducibility and audit trail
12. **API access** — Integration with QMS tools (MasterControl, etc.)
13. **Additional databases** — ANSM (France), EUDAMED, Health Canada, TGA
14. **German language interface** — i18n exists in code but site is English-only

---

## Page-by-Page Ratings

| Page | Anna (PRRC) | Michael (QM) | Sarah (Founder) | Avg |
|------|-------------|--------------|-----------------|-----|
| Homepage | 4 | 4 | 4 | **4.0** |
| Pricing | 3 | 3 | 3.5 | **3.2** |
| Signup | 3 | 4 | — | **3.5** |
| FAQ | 4 | 5 | 4.5 | **4.5** |
| Sample Report | 4.5 | 4 | 5 | **4.5** |
| Contact | — | 3 | — | **3.0** |
| Privacy/Terms | 4* | — | 2 | **3.0** |
| AI Transparency | — | 5 | — | **5.0** |

*Anna rated Privacy 4/5 for content quality despite DRAFT status

---

## Regulatory Accuracy Assessment

### Correct
- "Relevant / Uncertain / Excluded" classification is appropriate for PMS
- PRRC review gate aligns with EU MDR Art. 15 obligations
- "Supports but does not replace PMS" — honest and accurate positioning
- 10-year retention matches EU MDR Art. 10(8)
- AI Transparency page correctly addresses EU AI Act (minimal risk classification)
- Two-stage AI pipeline (Haiku pre-filter + Sonnet analysis) is well-architected

### Needs Attention
- Homepage lacks explicit EU MDR article references (Art. 83, 84, 15)
- "Confidence score" explanation in FAQ oversimplifies — AI scores aren't calibrated probabilities
- FDA MAUDE is adverse events, not FSNs — correctly labeled but distinction could be clearer
- Assessment criteria in sample report doesn't mention EMDN matching despite using it in rationales
- No mention of PSUR integration pathway

### Missing
- EUDAMED integration plan (will become mandatory)
- Scientific literature monitoring (required by Art. 83(3))
- RAPEX/Safety Gate coverage
- Validation documentation package (IQ/OQ/PQ) for QMS onboarding

---

## Bugs Found During Testing

| Bug | Severity | All 3 Flagged? |
|-----|----------|----------------|
| /terms redirects to /signup | P0 | Yes |
| /dpa redirects to /signup | P0 | Yes |
| /imprint redirects to /login | P0 | Yes |
| DRAFT labels on legal pages | P0 | Yes |
| [TO BE ADDED] company address | P0 | Yes |
| Free tier in FAQ but not on pricing page | P1 | 2/3 |
| CSP console errors (12-28 per page) | P2 | Fixed today |
| Confidence score "3%" ambiguous on homepage | P2 | 1/3 |

---

## Bottom Line

> **The product concept is sound and the domain knowledge is rare.** All three personas independently recognized genuine EU MDR expertise in the product design. The sample report and FAQ are best-in-class. The PRRC review gate is architecturally correct.
>
> **The blockers are all fixable and non-technical.** Broken legal page routing, DRAFT labels, and missing company address are the only things preventing all three personas from signing up. These are deployment/content issues, not product issues.
>
> **Priority for public launch:** Fix legal page routing → Finalize legal documents → Define PRRC on homepage → Add annual pricing → Add mid-tier plan → Demo booking on contact page.
