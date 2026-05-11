# Landing Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Neuridion landing page with 6 targeted changes: static hero, product screenshot, How It Works section, FAQ, regulatory language fixes, and Security & Compliance section.

**Architecture:** All changes in `app/page.tsx` (the main landing page Server Component), plus a language fix in `app/components/FaqAccordion.tsx`. No new dependencies. The animated hero components (`app/components/AnimatedHero.tsx` and `components/ui/animated-hero.tsx`) are no longer imported but left in place for now (no deletion).

**Tech Stack:** Next.js App Router (Server Component), React, Tailwind CSS v4, lucide-react icons

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `app/page.tsx` | Replace AnimatedHero import with inline static hero; add Product Screenshot, How It Works, FAQ, Security & Compliance sections; fix regulatory language in Trust Bar and CTA |
| Modify | `app/components/FaqAccordion.tsx` | Fix Q3 answer wording ("compliant" → "supports") |
| Create | `public/screenshots/dashboard-preview.png` | Placeholder image (teal gradient with "Dashboard Preview" text) |

---

### Task 1: Fix FaqAccordion language

**Files:**
- Modify: `app/components/FaqAccordion.tsx:17`

- [ ] **Step 1: Fix Q3 answer**

In `app/components/FaqAccordion.tsx` line 17, change:

```typescript
    answer: 'Yes, Neuridion is built specifically for EU MDR Article 83 compliance. Our reports are formatted to meet regulatory requirements and include full audit trails for documentation purposes.',
```

to:

```typescript
    answer: 'Neuridion is built specifically to support EU MDR Article 83 post-market surveillance requirements. Our reports are formatted for regulatory reviews and include full audit trails for documentation purposes.',
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -5`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/FaqAccordion.tsx
git commit -m "fix(landing): soften MDR compliance claim in FAQ — supports, not certifies

Co-Authored-By: Neuridion"
```

---

### Task 2: Create placeholder screenshot

**Files:**
- Create: `public/screenshots/dashboard-preview.png`

- [ ] **Step 1: Create a simple placeholder SVG converted to purpose**

Since we need a real screenshot eventually, create a styled placeholder. Use an SVG-based approach — create a simple HTML file, take a screenshot, or generate a gradient PNG. For now, create a minimal placeholder SVG that will display nicely:

Create `public/screenshots/dashboard-preview.svg` with a 1200x700 teal-gradient rectangle containing centered "Dashboard Preview — Screenshot Coming Soon" text in navy, styled to look like a browser window mockup with a top bar.

- [ ] **Step 2: Commit**

```bash
git add public/screenshots/
git commit -m "chore: add placeholder dashboard preview for landing page

Co-Authored-By: Neuridion"
```

---

### Task 3: Rewrite app/page.tsx with all landing page changes

**Files:**
- Modify: `app/page.tsx`

This is the main task. The page is a Server Component — no `'use client'` needed. Changes:

1. Remove `AnimatedHero` import, add `FaqAccordion` import
2. Replace `<AnimatedHero />` with inline static hero
3. Fix Trust Bar language ("compliant" → "ready")
4. Add Product Screenshot section after Trust Bar
5. Add How It Works section before Features
6. Add FAQ section after Features
7. Add Security & Compliance section after FAQ
8. Fix CTA language ("PMS" → "post-market surveillance")

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { AnimatedHero } from './components/AnimatedHero'
```

With:
```typescript
import { FaqAccordion } from './components/FaqAccordion'
import { Shield, Lock, FileCheck, Trash2 } from 'lucide-react'
```

Also add `Image` import from `next/image` if using next/image for the screenshot, or just use a styled div placeholder.

- [ ] **Step 2: Replace hero section**

Replace `<AnimatedHero />` with:

```tsx
      {/* Hero */}
      <section className="py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 bg-[#CCFBF1] text-[#115E59] text-sm font-semibold rounded-full border border-[#0D9488] mb-6">
            EU MDR Article 83
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#0F1F3D] tracking-tight mb-5">
            Your PRRC&apos;s Post-Market Surveillance — Done in Minutes
          </h1>
          <p className="text-lg md:text-xl leading-relaxed text-[#134E4A] max-w-2xl mx-auto font-medium mb-8">
            Search BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel. AI filters every Field Safety Notice against your device profile. Export audit-ready PDF reports.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#1a2d52] transition-colors text-sm"
            >
              Start 14-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-xs text-[#0F766E] mt-3">
            No credit card required &middot; Cancel anytime
          </p>
        </div>
      </section>
```

- [ ] **Step 3: Fix Trust Bar language**

Change `Art. 83 compliant` to `Art. 83 ready`:

```tsx
            <div>
              <div className="text-xl font-bold text-[#0D9488]">EU MDR</div>
              <div className="text-xs text-[#134E4A] font-medium mt-1">
                Art. 83 ready
              </div>
            </div>
```

- [ ] **Step 4: Add Product Screenshot section after Trust Bar**

Insert after the Trust Bar closing `</section>`:

```tsx
      {/* Product Preview */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-lg border border-[#E2E8F0] shadow-lg overflow-hidden">
            <div className="bg-[#F1F5F9] border-b border-[#E2E8F0] px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
                <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
                <div className="w-3 h-3 rounded-full bg-[#E2E8F0]" />
              </div>
              <div className="flex-1 text-center text-xs text-[#94A3B8] font-medium">
                neuridion.eu/dashboard
              </div>
            </div>
            <div className="bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1] flex items-center justify-center" style={{ minHeight: '400px' }}>
              <div className="text-center px-8">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-[#0F1F3D] font-semibold text-lg">Dashboard Preview</p>
                <p className="text-[#0F766E] text-sm mt-1">Product screenshot coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 5: Add How It Works section before Features**

Insert before the Features `<section id="features">`:

```tsx
      {/* How It Works */}
      <section className="py-20 bg-[#F0FDFA] border-y border-[#CCFBF1]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">How it works</h2>
            <p className="text-[#134E4A]">Three steps from device profile to audit-ready report.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Define your device profile',
                desc: 'Enter your device name, manufacturer, and classification. Neuridion builds optimized search terms automatically.',
              },
              {
                step: '2',
                title: 'Run a search',
                desc: 'Select databases and date range. Neuridion searches BfArM, FDA MAUDE, MHRA, and Swissmedic in parallel.',
              },
              {
                step: '3',
                title: 'Review and export',
                desc: 'AI classifies each result. Your PRRC reviews the decisions, then exports a PDF report ready for your next audit.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#0F1F3D] text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                  {step}
                </div>
                <h3 className="text-base font-semibold text-[#0F1F3D] mb-2">{title}</h3>
                <p className="text-sm text-[#134E4A] leading-relaxed font-medium">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 6: Add FAQ section after Features**

Insert after the Features closing `</section>`:

```tsx
      {/* FAQ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">
              Frequently asked questions
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>
```

- [ ] **Step 7: Add Security & Compliance section after FAQ**

Insert after the FAQ section:

```tsx
      {/* Security & Compliance */}
      <section className="py-20 bg-white border-y border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#0F1F3D] mb-3">
              Security &amp; compliance
            </h2>
            <p className="text-[#134E4A]">
              Built for regulated industries from day one.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                Icon: Shield,
                title: 'GDPR by design',
                desc: 'All data processed and stored in the EU. Encryption at rest and in transit.',
              },
              {
                Icon: FileCheck,
                title: 'Append-only audit trail',
                desc: 'Every action logged immutably. Full traceability for regulatory audits.',
              },
              {
                Icon: Lock,
                title: 'Role-based access',
                desc: 'PRRC review gate ensures no AI decision reaches your report unchecked.',
              },
              {
                Icon: Trash2,
                title: 'Data minimization',
                desc: 'We collect only what’s needed. Account deletion with full data purge on request.',
              },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-5 rounded border border-[#E2E8F0] hover:border-[#0D9488] transition-colors">
                <Icon className="w-6 h-6 text-[#0D9488] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-[#0F1F3D] mb-1">{title}</h3>
                  <p className="text-sm text-[#134E4A] leading-relaxed font-medium">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 8: Fix CTA language**

Change:
```tsx
            Ready to automate your PMS?
```
to:
```tsx
            Ready to streamline your post-market surveillance?
```

- [ ] **Step 9: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx
git commit -m "feat(landing): redesign with static hero, How It Works, FAQ, Security sections

- Replace animated hero with static outcome-driven headline
- Add product screenshot placeholder section
- Add 3-step How It Works section
- Render FaqAccordion on landing page
- Add Security & Compliance 2x2 grid
- Fix regulatory language (compliant → ready, PMS → post-market surveillance)

Co-Authored-By: Neuridion"
```

---

### Task 4: Verify and push

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 2: Push**

```bash
git push origin main
```
