# @react-pdf/renderer Migration — Design Spec

**Date:** 2026-05-11
**Status:** Approved

## Goal

Replace Playwright (headless Chromium) PDF generation with `@react-pdf/renderer` — a pure-JS React component-based PDF generator. Eliminates Chromium dependency, fixes OOM risk on Render 512MB tier, and removes external service costs.

## Problem

Playwright requires headless Chromium (~200MB RAM) alongside Next.js (~200MB). On Render's 512MB tier, this causes OOM kills. The singleton browser pattern in `lib/pdfshift.ts` caches dead browser references on crash, silently breaking all future PDF requests until server restart.

## Solution

Use `@react-pdf/renderer`'s `renderToBuffer()` to generate PDFs from React component trees. ~10MB RAM per render. No browser, no system deps, no external API.

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `lib/pdf/report-document.tsx` | React-PDF Document component replicating current HTML report layout |
| Rewrite | `lib/pdfshift.ts` | Remove Playwright. New `generateReportPdf(data)` using react-pdf. Raise quotas. |
| Modify | `app/api/reports/route.ts` | Import `generateReportPdf` instead of `generatePdfFromHtml`. Pass structured data. |
| Modify | `render.yaml` | Remove `npx playwright install --with-deps chromium` from build command |
| Modify | `package.json` | Remove `playwright`. Add `@react-pdf/renderer`. |

## Report Component Structure

`lib/pdf/report-document.tsx` — single `<Document>` with `<Page>` containing:

1. **Header** — navy border-bottom, "Post-Market Surveillance / Field Safety Notice Review Report / Database Search & Assessment"
2. **Section 1: Document Information** — 2-column meta table (device, manufacturer, class, EMDN, period, date, doc ref)
3. **Section 2: Search Methodology** — 2-column meta table (databases, date range, parameters, criteria)
4. **Section 3: Stats Grid** — horizontal row of stat boxes (Total, Relevant, Review, Not Relevant, optionally AI Unavailable) with colored borders
5. **Section 4: Potentially Relevant** — green `#16a34a` section bar + 5-column results table (Title, Manufacturer, Date, Source, Rationale)
6. **Section 5: Requires Further Review** — amber `#d97706` section bar + 5-column table
7. **Section 6: AI Filter Unavailable** (conditional) — red `#dc2626` section bar + warning banner + 5-column table
8. **Appendix A: Excluded FSNs** — grey `#6b7280` section bar + compact 4-column table (Title, Manufacturer, Date, Notes) with truncated rationale
9. **Conclusion** — italic text block with dynamic summary
10. **Review & Approval** — 2-column signature grid (Prepared by / Reviewed by)
11. **AI Disclaimer** — footer with grey border-top

## Styling

- **Font:** Inter, registered via `Font.register()` from Google Fonts CDN (400, 500, 600, 700 weights)
- **Colors:** Navy `#1a1a2e`, green `#16a34a`, amber `#d97706`, grey `#6b7280`, red `#dc2626`, text `#1a1a1a`
- **Page:** A4, padding 2.2cm top, 2cm sides, 2.5cm bottom (matches current HTML template)
- **Tables:** react-pdf `<View>` rows with flex columns matching current width percentages

## Data Flow

**Before:** `route.ts` → `buildReportHtml(profile, run, rows)` → HTML string → `generatePdfFromHtml(html)` → Playwright renders HTML → PDF buffer

**After:** `route.ts` → `generateReportPdf({ profile, run, rows, runId })` → `renderToBuffer(<ReportDocument />)` → PDF buffer

## Interface

```typescript
// lib/pdfshift.ts
interface ReportData {
  profile: {
    device_name: string
    manufacturer: string
    device_class: string | null
    emdn_code: string | null
  }
  run: { period_from: string; period_to: string }
  rows: FsnRow[]
  runId: string
}

export async function generateReportPdf(data: ReportData): Promise<Buffer>
export async function canGeneratePdf(adminClient: SupabaseClient, userId: string): Promise<{ allowed: boolean; reason?: string }>
export async function incrementPdfUsage(adminClient: SupabaseClient, userId: string): Promise<void>
```

## Quota Changes

| Limit | Before | After |
|-------|--------|-------|
| Monthly global | 45 | 500 |
| Per user | 15 | 50 |

## What Stays Unchanged

- `buildReportHtml()` — still used for HTML report upload to Supabase Storage
- `buildExcel()` — untouched
- `canGeneratePdf()` / `incrementPdfUsage()` — same logic, new limits
- All Supabase Storage upload paths — same
- Route handler structure — same flow, different PDF call

## What Gets Removed

- `playwright` from `package.json`
- `npx playwright install --with-deps chromium` from `render.yaml`
- Singleton browser pattern (`getBrowser()`, `browserPromise`) from `lib/pdfshift.ts`
- `generatePdfFromHtml(html: string)` function

## Non-Goals

- No changes to Excel generation
- No changes to HTML report upload
- No changes to the report route's auth, validation, or storage logic
- No UI changes
