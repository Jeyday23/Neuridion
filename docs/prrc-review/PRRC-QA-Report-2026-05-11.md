# PRRC Quality Assurance Report

**Date:** 2026-05-11
**Environment:** Local dev (http://localhost:3000)
**App Version:** 09c96c4
**Test Account:** test-account@example.com

## Executive Summary

Ran 21 tests across 11 sections. **10 passed, 3 failed, 8 skipped.** Overall score: **77%**.

Top issue: Public Pages — Pricing page renders tiers.

## Results Matrix

| # | Section | Tests | Pass | Fail | Skip | Score |
|---|---------|-------|------|------|------|-------|
| 1 | Public Pages | 7 | 6 | 1 | 0 | 86% |
| 2 | Authentication | 4 | 2 | 2 | 0 | 50% |
| 3 | Dashboard Layout | 1 | 0 | 0 | 1 | 0% |
| 4 | Profiles | 1 | 0 | 0 | 1 | 0% |
| 5 | Search | 1 | 0 | 0 | 1 | 0% |
| 6 | Report Generation | 1 | 0 | 0 | 1 | 0% |
| 7 | Archive | 1 | 0 | 0 | 1 | 0% |
| 8 | Settings | 1 | 0 | 0 | 1 | 0% |
| 9 | Billing | 1 | 0 | 0 | 1 | 0% |
| 10 | Admin Panel | 1 | 0 | 0 | 1 | 0% |
| 11 | Error Handling | 2 | 2 | 0 | 0 | 100% |

## Detailed Findings

### Public Pages

#### Landing page loads — PASS
**Result:** Title: "Neuridion — Post-Market Surveillance for Medical Device Manufacturers", hero visible

#### Pricing page renders tiers — FAIL
**Result:** Expected 3+ plan tiers, found 0
**Screenshot:** screenshots/Public_Pages_Pricing_page_renders_tiers.png

#### Privacy page loads — PASS
**Result:** Heading: "Privacy Policy"

#### Terms page loads — PASS
**Result:** Heading: "Terms of Service"

#### DPA page loads — PASS
**Result:** Heading: "Data Processing Agreement (DPA)"

#### Footer has correct contact email — PASS
**Result:** Found 2 mailto link(s)

#### Cookie banner appears — PASS
**Result:** Cookie banner appeared on fresh session

### Authentication

#### Login page renders OTP form — PASS
**Result:** Login page rendered with email input

#### OTP send and login — PASS
**Result:** OTP form appeared after email submission
**Suggestion:** Consider adding a test mode that auto-fills OTP for CI/CD

#### Session-based login bypass — FAIL
**Result:** Still redirected to login after session bypass
**Screenshot:** screenshots/Authentication_Session-based_login_bypass.png

#### Logout works — FAIL
**Result:** Logout link not found
**Screenshot:** screenshots/Authentication_Logout_works.png

### Dashboard Layout

#### Dashboard layout — SKIP
**Result:** Not authenticated — skipping dashboard tests

### Profiles

#### All profile tests — SKIP
**Result:** Not authenticated

### Search

#### All search tests — SKIP
**Result:** Not authenticated

### Report Generation

#### All report tests — SKIP
**Result:** Not authenticated

### Archive

#### All archive tests — SKIP
**Result:** Not authenticated

### Settings

#### All settings tests — SKIP
**Result:** Not authenticated

### Billing

#### All billing tests — SKIP
**Result:** Not authenticated

### Admin Panel

#### All admin tests — SKIP
**Result:** Not authenticated

### Error Handling

#### 404 page for invalid route — PASS
**Result:** 404 handled (HTTP 200)

#### Rate limit returns 429 — PASS
**Result:** Rate limit triggered after 4 requests

## Priority Action Items

1. **[Public Pages]** Pricing page renders tiers — Expected 3+ plan tiers, found 0
2. **[Authentication]** Session-based login bypass — Still redirected to login after session bypass
3. **[Authentication]** Logout works — Logout link not found

## UX & Improvement Suggestions

- **Authentication / OTP send and login:** Consider adding a test mode that auto-fills OTP for CI/CD

