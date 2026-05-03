# Neuridion Design System

> **Status: Draft — awaiting approval before any UI changes are made.**

---

## 1. Brand Identity

**Company & Product:** Neuridion  
**Domain:** neuridion.eu  
**Contact:** info@neuridion.eu  
**Tagline context:** EU MDR post-market surveillance — professional, precise, compliance-grade.

This product serves medical device manufacturers working under regulatory obligation. The UI must feel like software built by a human agency — not a generated template, not a marketing page. Every visual decision defers to function.

---

## 2. Color System

### Palette

| Token | Hex | Role |
|---|---|---|
| `--color-navy` | `#0F1F3D` | Primary brand color. Headings, sidebar, nav, strong labels. |
| `--color-teal` | `#0D9488` | Single interactive accent. Buttons, links, focus rings, active states only. |
| `--color-white` | `#FFFFFF` | Page background, card surfaces, input backgrounds. |
| `--color-off-white` | `#F8FAFC` | Alternating table rows, sidebar background, subtle surface tint. |
| `--color-border` | `#E2E8F0` | All borders — cards, inputs, dividers, table lines. |
| `--color-text-body` | `#374151` | Body text, table cell values, descriptions. |
| `--color-text-muted` | `#6B7280` | Secondary labels, timestamps, metadata, placeholder text. |
| `--color-text-heading` | `#0F1F3D` | All headings (h1–h4). Same as navy. |
| `--color-success` | `#059669` | Success badges, completed status. |
| `--color-success-bg` | `rgba(5,150,105,0.08)` | Success badge background. |
| `--color-error` | `#DC2626` | Error text, failed status, destructive actions. |
| `--color-error-bg` | `rgba(220,38,38,0.06)` | Error badge background. |
| `--color-warning` | `#D97706` | Degraded/warning status. |
| `--color-warning-bg` | `rgba(217,119,6,0.08)` | Warning badge background. |

### Rules
- **No gradients anywhere** — no `linear-gradient`, no `bg-gradient-*`, no `from-*`, no `to-*`
- **No glassmorphism** — no `backdrop-blur`, no `bg-*/opacity-*` stacking for frosted effects, no blur filters
- The teal (`#0D9488`) is used **only** for interactive elements: primary buttons, active nav links, focus rings, checkboxes, toggle states
- Never use teal for decorative or structural purposes (borders, backgrounds, section dividers)
- Status colors (success/error/warning) are for badge/status contexts only — never for primary UI chrome

---

## 3. Typography

**Font:** Geist Sans (already loaded via `next/font/google` as `--font-geist-sans`)  
**Monospace:** Geist Mono (`--font-geist-mono`) for code, IDs, technical values

Geist has full Latin Extended support — EN/DE bilingual rendering is correct out of the box. Umlauts (ä, ö, ü, ß) render correctly at all weights.

### Weight Scale

| Weight | Tailwind class | Use |
|---|---|---|
| 400 | `font-normal` | Body text, table values, descriptions, input values |
| 500 | `font-medium` | Navigation links, secondary labels, badge text |
| 600 | `font-semibold` | Table column headers, form labels, small UI labels |
| 700 | `font-bold` | Page headings (h1, h2) only — not for labels or body |

**Rule:** `font-bold` is reserved for `h1` and `h2` headings. Use `font-semibold` for labels and UI elements. Never use `font-bold` on body text, buttons, or table cells.

### Size Hierarchy

| Role | Tailwind | Size | Weight |
|---|---|---|---|
| Page title (h1) | `text-xl` | 20px | `font-bold` |
| Section heading (h2) | `text-lg` | 18px | `font-bold` |
| Sub-heading (h3) | `text-base` | 16px | `font-semibold` |
| Body | `text-sm` | 14px | `font-normal` |
| Label / table header | `text-sm` | 14px | `font-semibold` |
| Caption / metadata | `text-xs` | 12px | `font-normal` or `font-medium` |

This is a **data-dense application**, not a marketing site. Headlines are functional labels, not hero statements. Keep heading sizes restrained.

---

## 4. Spacing & Layout

- **Base unit:** 4px (Tailwind default)
- **Content max-width:** `max-w-6xl` (72rem) for main content areas
- **Page padding:** `p-8` on desktop, `p-4` on mobile
- **Section gaps:** `gap-6` between cards, `gap-4` between form fields
- **Table cell padding:** `px-4 py-3` (compact — data tables should feel like software, not spreadsheets with generous whitespace)

---

## 5. Border Radius

**Maximum radius: 6px (`rounded-md`)**

| Element | Class | Radius |
|---|---|---|
| Cards, panels, modals | `rounded-md` | 6px |
| Buttons | `rounded` | 4px |
| Inputs, selects, textareas | `rounded` | 4px |
| Badges, status pills | `rounded` | 4px |
| Small indicator dots | `rounded-full` | allowed — functional (≤8px diameter) |
| Progress bars (inner fill) | `rounded-full` | allowed — functional |

**Never use:** `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl`, `rounded-3xl`, `rounded-full` on buttons or cards.

---

## 6. Shadows

**Functional shadows only.** A shadow communicates layering (this element floats above the page). It is not decoration.

| Context | Shadow | Tailwind |
|---|---|---|
| Dropdowns, popovers, tooltips | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)` | `shadow-md` |
| Modals, dialogs | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)` | `shadow-lg` |
| Cards, panels | No shadow — border only (`border border-[#E2E8F0]`) | — |
| Sticky headers | `0 1px 3px rgba(0,0,0,0.08)` | `shadow-sm` |

**Never use:** `shadow-xl`, `shadow-2xl`, decorative colored shadows, box-shadow for non-floating elements.

Cards are distinguished from the page background by their **border**, not a shadow.

---

## 7. Components

### Buttons

**Primary (teal):**
```
bg-[#0D9488] text-white font-medium text-sm px-4 py-2 rounded
hover:bg-[#0F766E] transition-colors
```

**Secondary (outline):**
```
border border-[#E2E8F0] text-[#374151] font-medium text-sm px-4 py-2 rounded
hover:border-[#0D9488] hover:text-[#0D9488] transition-colors bg-white
```

**Destructive:**
```
border border-[#E2E8F0] text-[#6B7280] font-medium text-sm px-2.5 py-1 rounded
hover:text-[#DC2626] hover:border-red-300 transition-colors
```

**Disabled state:** `opacity-50 cursor-not-allowed` on any button variant.

### Badges / Status Pills

```
inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium
```

Status color classes:
- `complete`: `bg-[rgba(5,150,105,0.08)] text-[#059669] border-[rgba(5,150,105,0.2)]`
- `running` / `filtering`: `bg-blue-50 text-blue-700 border-blue-200`
- `queued`: `bg-[#F8FAFC] text-[#6B7280] border-[#E2E8F0]`
- `error`: `bg-[rgba(220,38,38,0.06)] text-[#DC2626] border-[rgba(220,38,38,0.2)]`
- `cancelled` / `degraded`: `bg-[#F8FAFC] text-[#6B7280] border-[#E2E8F0]`

### Inputs & Forms

```
border border-[#E2E8F0] rounded px-3 py-2 text-sm text-[#374151]
focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent
placeholder:text-[#6B7280] bg-white
```

Form labels: `text-sm font-semibold text-[#0F1F3D] mb-1`

### Cards / Panels

```
bg-white border border-[#E2E8F0] rounded-md
```

No shadow. No gradient. Background separates from `#F8FAFC` page surfaces via the border alone.

### Tables

Tables must feel like **professional software** — not a marketing comparison table.

```
Header row: bg-[#F8FAFC] border-b border-[#E2E8F0]
Header cell: px-4 py-3 text-left text-sm font-semibold text-[#0F1F3D]
Body row: border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC] transition-colors
Body cell: px-4 py-3 text-sm text-[#374151]
```

### Navigation / Sidebar

Sidebar background: `#F8FAFC` with `border-r border-[#E2E8F0]`  
Brand wordmark: `text-base font-bold text-[#0F1F3D]` — text only, no gradient, no icon treatment  
Active nav link: `bg-white text-[#0D9488] font-medium border-r-2 border-[#0D9488]` (right-border accent)  
Inactive nav link: `text-[#374151] hover:text-[#0F1F3D] hover:bg-white`

---

## 8. Explicit Prohibitions

These are hard rules — no exceptions:

- **No gradients** of any kind (`linear-gradient`, `radial-gradient`, Tailwind `bg-gradient-*`)
- **No glassmorphism** (`backdrop-blur`, `bg-white/80`, frosted overlays)
- **No blur effects** (`blur-*`, `backdrop-filter`)
- **No border radius above 6px** on any interactive or structural element
- **No `shadow-xl` or `shadow-2xl`** — functional shadows only (see §6)
- **No emoji** in any professional interface element (buttons, labels, headings, status, table cells)
- **No `font-bold` on anything other than h1/h2 headings**
- **No color accents other than teal** for interactive elements — no blue-600 CTA buttons, no purple badges
- **No `rounded-full`** on buttons, cards, or badges (only on ≤8px indicator dots)

---

## 9. Reference: What Stripe Does That We Adapt

Stripe's DESIGN.md was studied as a reference. Key adaptations for Neuridion:

| Stripe | Neuridion adaptation |
|---|---|
| Weight 300 as headline signature | Weight 700 for headings (Geist reads lighter than sohne-var; 300 would be too thin) |
| Blue-tinted decorative shadows | No decorative shadows — border-only for cards |
| Ruby-to-magenta gradients for hero | No gradients anywhere |
| Multiple accent colors | One accent only: teal #0D9488 |
| Backdrop blur on sticky nav | No blur effects |
| 4–8px border radius | 4–6px maximum (same philosophy, stricter cap) |
| sohne-var custom font | Geist (already loaded, similar geometric feel) |
| Deep navy headings (not black) | Deep navy headings (#0F1F3D — same principle) |
| Conservative rounding | Conservative rounding — aligned |
| Data-dense tables | Data-dense tables — aligned |

---

## 10. Business Details

| Field | Value |
|---|---|
| Brand name | Neuridion |
| Domain | neuridion.eu |
| Contact email | info@neuridion.eu |
| Copyright | © 2026 Neuridion |

---

*This document is the single source of truth for Neuridion's UI. All `.tsx` component styling decisions are governed by these rules.*
