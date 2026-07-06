# Neuridion — Future Features & Unicorn Roadmap

> Planning document only. Nothing in this file changes runtime behavior.
> Companion to `docs/architecture/ENTERPRISE_SCALE_ROADMAP.md` (branch `plan/enterprise-scale-roadmap`),
> which covers infrastructure scaling. This document covers **product, UX, and business strategy**.
>
> Written from a full repo scan on 2026-07-06 (branch: `plan/future-features-roadmap`).

---

## 1. Where the product stands today

### Strengths (verified in code)

| Area | State |
|---|---|
| Data acquisition | 4 regulatory sources (BfArM, FDA MAUDE, MHRA, Swissmedic) + Firecrawl fallback, canonical dedup (`fsn_canonical`), coverage tracking (`sync_coverage`) |
| AI pipeline | Two-stage Claude filter (Haiku triage → Sonnet full), content-aware decision cache (~80% cost reduction), golden-fixture eval harness, prompt-version cache invalidation |
| Reports | PDF (react-pdf), Excel, Word — plan-gated, quota-tracked |
| Compliance posture | GDPR export/delete, cookie consent, audit logging, append-only filter decisions, RLS, security audit docs |
| Billing | Stripe checkout + portal, 5 plan tiers (free → enterprise), trial codes for DEMA booth |
| Quality | 606 passing tests, TSC clean, release verification scripts, source-parity verifier |
| i18n | EN/DE via `lib/i18n.ts` |

### Gaps that cap growth (verified in code)

1. **The product is a search tool, not a monitoring system.** Every insight requires a user to log in, configure a run, and wait. `lib/email.ts` sends exactly one email type (feedback notification to the founder). Starter/Pro plans advertise "Email notifications" in `lib/plans.ts` — **that feature does not exist yet**. This is the single biggest gap between the pitch and the code.
2. **No recurring reason to open the app.** The dashboard landing (`app/dashboard/page.tsx`) is a 5-line redirect. There is no home surface showing "what changed since you last looked."
3. **UI is three shared components** (`button`, `logo`, `wordmark`). Every dashboard page hand-rolls its tables, badges, dialogs, and forms. `search-panel.tsx` is 672 lines of mixed state + markup. This slows every future feature.
4. **Single-user accounts.** No teams, no roles, no shared profiles. PMS in real manufacturers is a team sport (PRRC + QA + regulatory affairs), and per-seat expansion is the cheapest revenue lever that exists.
5. **Progress is polled, not pushed.** Search progress uses `setInterval` polling (already flagged in the enterprise roadmap §12). Feels laggy and burns requests.
6. **4 jurisdictions.** MDR-relevant authorities missing: EUDAMED (when public), ANSM (FR), AEMPS (ES), IMDRF/NCAR network, Health Canada, TGA (AU), PMDA (JP).

---

## 2. Strategic thesis — the unicorn shift

**Today:** "Search regulatory databases faster." That's a €199–599/mo productivity tool with a ceiling — it competes with an intern and a bookmark folder, and usage is episodic (quarterly PSUR panic).

**Unicorn version:** *The system of record for post-market surveillance.* The product that a notified body auditor asks to see. Three compounding layers:

1. **Vigilance autopilot (the hook).** Continuous monitoring per device profile. The user configures once; Neuridion watches every source daily, filters with AI, and pushes alerts + a weekly digest. Value accrues while the user sleeps. This flips the engagement model from "15 searches/month" to "always on" — and justifies subscription pricing emotionally, not just contractually.
2. **PMS workflow (the lock-in).** Found signals flow into an assessment queue: relevant → assessed → action documented → feeds the PSUR/PMS report. Every decision (human or AI) is already append-only in the DB — surface that as an **audit trail the PRRC can hand to a notified body**. Once a manufacturer's vigilance history lives in Neuridion, churn approaches zero. Compliance tools with audit history have the stickiest retention profile in SaaS.
3. **The data moat (the network effect).** `fsn_canonical` is quietly the most valuable table in the product. Every customer search enriches a normalized, deduplicated, AI-classified corpus of field safety notices across jurisdictions. At scale this becomes: manufacturer risk scores, device-category incident trends, "similar device" early-warning signals, benchmark reports. No competitor starting later can reproduce the accumulated classification history. This is what makes it a *data company*, not a scraper wrapper.

The sequencing matters: 1 drives acquisition, 2 drives retention, 3 drives valuation.

---

## 3. Horizon 1 — Smoothness & retention (0–3 months)

Goal: make the existing product feel inevitable, and ship the promised-but-missing notification feature before a customer notices.

### 3.1 Email alerts & weekly digest ⚑ highest priority
- Scheduled ingestion already exists as a backlog design (`docs/BACKLOG.md` — incremental sync). Build it, then diff new canonical FSNs against each active device profile.
- Alert email: "2 new relevant notices for [Profile X]" with AI rationale snippets and deep link.
- Weekly digest even when nothing was found — "0 new signals, 4 sources checked, coverage through 2026-07-04" is *itself* the compliance value ("we monitored and found nothing" is a PSUR sentence).
- Closes the `lib/plans.ts` feature-list gap.

### 3.2 Dashboard home that answers "what changed?"
Replace the redirect with a real overview: new signals since last visit, monitoring status per profile, source health, quota usage, next PSUR due date (user-entered). This is the daily-open surface the product currently lacks.

### 3.3 Design-system buildout
- Extract from existing pages into `components/ui/`: `Table`, `Badge` (status colors already specified in DESIGN.md), `Card`, `Dialog`, `EmptyState`, `Skeleton`, `Toast`, `Select`, `DateRangePicker`.
- Decompose `search-panel.tsx` (672 lines) into panel/form/state-hook per the enterprise roadmap §12.2.
- Payoff: every Horizon-2 feature ships 2–3× faster and looks consistent.

### 3.4 Interaction smoothness
- **Live progress over polling:** Supabase Realtime channel on `search_runs` (contract already sketched in enterprise roadmap §2.3). Progress bar becomes event-driven; kill the 1s `setInterval`s.
- **Optimistic UI** on profile save, draft save, run cancel.
- **Command palette (⌘K):** jump to profile, start search, open archive run. Cheap to build, disproportionately premium feel for a data-dense tool.
- **Saved views / filters in URL** on archive and results tables (shareable links — also the first taste of collaboration).
- **Onboarding wizard:** first-login flow — create profile → run first search → see filtered results in under 3 minutes. Free plan gives exactly 1 run; make sure it lands.

### 3.5 Trust surfaces
- **AI decision review UX:** every filter decision already stores rationale + confidence. Add one-click "disagree" that (a) reclassifies for the user, (b) feeds the eval harness as a labeled example. Users train your moat while feeling in control.
- **Coverage transparency panel:** per-source "data current through …" indicator on results and reports (data exists in `sync_coverage`).

---

## 4. Horizon 2 — From tool to workflow (3–9 months)

### 4.1 Continuous monitoring as the primary product
- Profile setting: `monitoring: on` (plan-gated: Starter = weekly, Pro = daily, Enterprise = intraday).
- Reframe pricing copy from "searches per month" to "devices under surveillance" — aligns price with customer value and removes the artificial usage anxiety of run quotas.

### 4.2 Signal workflow (assessment queue)
- States: `new → under assessment → assessed-relevant → assessed-not-relevant → action documented`.
- Assignee, due date, free-text assessment, attachment upload.
- Every transition audited (extend existing `lib/audit.ts`).
- Output: "Vigilance log" export — the exact table a notified body asks for during an MDR audit.

### 4.3 PSUR/PMS report builder
- Today reports are search-run snapshots. Build the periodic report: pick profile + date range → auto-compile all signals, assessments, and coverage statements into a PSUR-section-ready document (templates per MDR Annex III / GSPR structure).
- This is the deliverable the customer is *legally required* to produce — owning it makes Neuridion the system of record.

### 4.4 Jurisdiction expansion (in ROI order)
1. ANSM (France) & AEMPS (Spain) — completes the big-4 EU markets.
2. Health Canada + TGA — cheap wins, English-language, API/bulk friendly.
3. EUDAMED vigilance module the day it goes public — being first matters for marketing.
4. FDA recalls & 510(k)/PMA context enrichment (openFDA, same infra as MAUDE).
- The scraper registry (`lib/scrapers/registry.ts`) already abstracts sources; each addition compounds the canonical-store moat.

### 4.5 Teams & roles
- Org model: owner / PRRC / member; shared profiles, shared archive, per-seat billing.
- Enterprise roadmap §13.3 already anticipates the tenant model — this is the revenue reason to build it.

### 4.6 Accessibility & i18n depth
- WCAG 2.2 AA pass on dashboard (keyboard nav through tables, focus management in dialogs) — enterprise procurement checklists ask for this.
- Add FR/ES/IT to i18n when the matching jurisdictions ship.

---

## 5. Horizon 3 — Platform & data company (9–24 months)

### 5.1 Public API + QMS integrations
- Versioned REST API (contract already designed, enterprise roadmap §7).
- Integrations: Greenlight Guru, Matrix Requirements, Veeva Vault, Jira. Push assessed signals into the customer's QMS; suddenly Neuridion is wired into their audit workflow, not adjacent to it.

### 5.2 Risk intelligence products (the data moat monetized)
- **Device-category trend reports:** incident velocity by category/jurisdiction, quarterly. Sellable standalone to consultants, notified bodies, investors, insurers.
- **Manufacturer watch:** monitor *competitors'* devices — same pipeline, new buyer inside the same account (regulatory affairs → also competitive intelligence budget).
- **Early-warning similarity signals:** "devices similar to yours have rising incident rates" — AI over the canonical corpus. This is the feature that gets written about.

### 5.3 Vertical expansion on the same engine
The pipeline (scrape → canonicalize → AI-filter → alert → report) is regulation-agnostic. Adjacent verticals with identical shape: IVDR (in-vitro), pharmacovigilance literature monitoring, cosmetics (CPNP), machinery (new Machinery Regulation). Each is a new TAM on amortized infrastructure — the classic unicorn expansion story.

### 5.4 AI copilot for the PRRC
- Chat over the customer's own vigilance corpus: "Summarize all Class I recalls affecting infusion pumps in DE since January", "Draft the PMS conclusion section for Profile X".
- Grounded in data Neuridion already normalized — hallucination risk is low, and the audit trail makes answers citable.

---

## 6. Business model levers

| Lever | Change | Why |
|---|---|---|
| Pricing axis | Searches/month → devices under surveillance + seats | Aligns with value; removes usage anxiety; expansion revenue as device portfolios grow |
| Annual plans | Offer 2 months free | PMS is a permanent legal obligation — annual is natural; improves cash for runway |
| Partner channel | Consultant/notified-body reseller tier (white-label reports) | Kodex Leads already builds partner sales enablement — reuse it |
| Enterprise wedge | SSO (SAML), audit-log export, SLA, DPA | Already promised in the enterprise tier copy; each unlocks procurement |
| Land-and-expand | Free plan = 1 profile *monitored* (not 1 search) | A monitored free profile sends alert emails forever — a permanent re-engagement channel |

---

## 7. North-star metrics

- **Devices under active monitoring** (the north star — replaces "search runs").
- Weekly digest open rate (retention proxy).
- Signals assessed in-app / signals found (workflow adoption → lock-in).
- Canonical FSN corpus size × classification coverage (moat depth).
- Net revenue retention (seat + profile expansion should push >110%).

---

## 8. Suggested branch map

| Branch | Scope |
|---|---|
| `feature/scheduled-sync` | Backlog item: incremental ingestion cron (prerequisite for alerts) |
| `feature/email-alerts` | Profile-diff alerts + weekly digest (Resend infra exists) |
| `feature/dashboard-home` | Overview page replacing redirect |
| `feature/design-system` | `components/ui` extraction + search-panel decomposition |
| `feature/realtime-progress` | Supabase Realtime search progress |
| `feature/signal-workflow` | Assessment queue + vigilance log export |
| `feature/psur-builder` | Periodic report compiler |
| `feature/orgs-and-seats` | Teams, roles, per-seat billing |
| `feature/source-ansm` … | One branch per new jurisdiction |

Ordering rule: nothing in Horizon 2 before **3.1 (alerts)** and **3.3 (design system)** land — the first closes a promise already printed on the pricing page, the second makes everything after it cheaper.
