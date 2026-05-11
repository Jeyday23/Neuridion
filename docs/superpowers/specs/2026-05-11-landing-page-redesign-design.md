# Landing Page Redesign — Design Spec

**Date:** 2026-05-11
**Status:** Approved (brainstorming session)

## Goal

Redesign the Neuridion landing page to communicate product value more clearly, reduce jargon, and convert visitors into trial signups. Six targeted changes — no full rewrite.

## Changes

### 1. Static Hero (replace animated)

Replace the framer-motion animated rotating-word hero with a static, outcome-driven headline.

**Headline:** "Your PRRC's Post-Market Surveillance — Done in Minutes"
**Subhead:** "Search BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel. AI filters every Field Safety Notice against your device profile. Export audit-ready PDF reports."

Remove the `framer-motion` dependency usage in the hero. The `AnimatedHero` wrapper component and `animated-hero.tsx` are replaced with a simple server-rendered hero section directly in `page.tsx`.

### 2. Product Screenshot Section

Add a section below the hero showing a real product screenshot (or placeholder image) of the dashboard. This gives visitors immediate visual understanding of what they're buying.

**Image path:** `public/screenshots/dashboard-preview.png` (placeholder with a styled container until real screenshot is captured)
**Layout:** Full-width section with centered image, subtle shadow, rounded corners. Light teal background band.

### 3. "How It Works" 3-Step Section

Add between Trust Bar and Features. Three numbered steps:

1. **Define your device profile** — "Enter your device name, manufacturer, and classification. Neuridion builds optimized search terms automatically."
2. **Run a search** — "Select databases and date range. Neuridion searches BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel."
3. **Review and export** — "AI classifies each result. Your PRRC reviews the decisions, then exports a PDF report ready for your next audit."

**Layout:** Horizontal 3-column on desktop, stacked on mobile. Navy number badge, teal accent line connecting steps.

### 4. FAQ Section

Render the existing `FaqAccordion` component on the landing page. It already has 5 relevant questions. One content fix needed:

- Q3 ("Is Neuridion MDR compliant?"): Change "Yes, Neuridion is built specifically for EU MDR Article 83 compliance" → "Neuridion is built specifically to support EU MDR Article 83 post-market surveillance requirements" (remove "compliant" claim per council recommendation — the tool supports compliance, it doesn't certify it)

**Position:** Between Features and Pricing sections.

### 5. Fix Regulatory Language

- Trust bar: "Art. 83 compliant" → "Art. 83 ready" (same principle — tool supports compliance, doesn't certify)
- CTA section: "Ready to automate your PMS?" → "Ready to streamline your post-market surveillance?" (spell out the abbreviation for visitors who aren't already familiar)

### 6. Security & Compliance Section

Add a section between FAQ and Pricing. Four items in a 2x2 grid:

1. **GDPR by design** — "All data processed and stored in the EU. Encryption at rest and in transit."
2. **Append-only audit trail** — "Every action logged immutably. Full traceability for regulatory audits."
3. **Role-based access** — "PRRC review gate ensures no AI decision reaches your report unchecked."
4. **Data minimization** — "We collect only what's needed. Account deletion with full data purge on request."

**Layout:** 2x2 grid with shield/lock icons. Light background.

## Section Order (top to bottom)

1. Nav (unchanged)
2. Hero (new static)
3. Trust Bar (language fix only)
4. Product Screenshot (new)
5. How It Works (new)
6. Features (unchanged)
7. FAQ (new — existing component)
8. Security & Compliance (new)
9. Pricing (unchanged)
10. CTA (language fix)
11. Footer (unchanged)

## Non-Goals

- No social proof section (explicitly declined)
- No Robert photo/quote
- No new color palette (keep existing NAVY/TEAL system)
- No changes to pricing cards, feature cards, nav, or footer structure
