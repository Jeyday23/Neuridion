import { chromium, type Browser, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Types ────────────────────────────────────────────────────────────────────

interface TestResult {
  section: string
  name: string
  status: 'pass' | 'fail' | 'skip'
  detail: string
  suggestion?: string
  screenshot?: string
}

interface SectionSummary {
  section: string
  total: number
  pass: number
  fail: number
  skip: number
}

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const BASE_URL = getArg('base-url', 'http://localhost:3000')
const TEST_EMAIL = getArg('email', '')
const SCREENSHOT_DIR = path.resolve('docs/prrc-review/screenshots')
const REPORT_DIR = path.resolve('docs/prrc-review')

// ── Supabase admin (for OTP bypass) ──────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

if (!TEST_EMAIL) {
  console.error('Usage: npx tsx scripts/prrc-review.ts --email user@example.com [--base-url http://localhost:3000]')
  process.exit(1)
}

const adminDb = createClient(supabaseUrl, supabaseServiceKey)

// ── Helpers ──────────────────────────────────────────────────────────────────

const results: TestResult[] = []

async function screenshot(page: Page, name: string): Promise<string> {
  const file = `${name.replace(/[^a-z0-9_-]/gi, '_')}.png`
  const filePath = path.join(SCREENSHOT_DIR, file)
  await page.screenshot({ path: filePath, fullPage: false })
  return `screenshots/${file}`
}

async function test(
  section: string,
  name: string,
  page: Page,
  fn: () => Promise<{ detail: string; suggestion?: string }>
): Promise<void> {
  try {
    const { detail, suggestion } = await fn()
    results.push({ section, name, status: 'pass', detail, suggestion })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    const screenshotPath = await screenshot(page, `${section}_${name}`)
    results.push({
      section,
      name,
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
      screenshot: screenshotPath,
    })
    console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`)
  }
}

function skip(section: string, name: string, reason: string): void {
  results.push({ section, name, status: 'skip', detail: reason })
  console.log(`  ○ ${name}: ${reason}`)
}

// ── Report generator ─────────────────────────────────────────────────────────

function generateReport(): string {
  const today = new Date().toISOString().slice(0, 10)
  let gitHash = 'unknown'
  try {
    gitHash = require('child_process').execSync('git rev-parse --short HEAD').toString().trim()
  } catch { /* ignore */ }

  const sections: SectionSummary[] = []
  const sectionNames = [...new Set(results.map((r) => r.section))]
  for (const s of sectionNames) {
    const items = results.filter((r) => r.section === s)
    sections.push({
      section: s,
      total: items.length,
      pass: items.filter((r) => r.status === 'pass').length,
      fail: items.filter((r) => r.status === 'fail').length,
      skip: items.filter((r) => r.status === 'skip').length,
    })
  }

  const totalPass = results.filter((r) => r.status === 'pass').length
  const totalFail = results.filter((r) => r.status === 'fail').length
  const totalSkip = results.filter((r) => r.status === 'skip').length
  const totalTests = results.length
  const overallScore = totalTests > 0 ? Math.round((totalPass / (totalTests - totalSkip)) * 100) : 0

  const failures = results.filter((r) => r.status === 'fail')
  const suggestions = results.filter((r) => r.suggestion)

  let md = `# PRRC Quality Assurance Report\n\n`
  md += `**Date:** ${today}\n`
  md += `**Environment:** Local dev (${BASE_URL})\n`
  md += `**App Version:** ${gitHash}\n`
  md += `**Test Account:** ${TEST_EMAIL}\n\n`

  md += `## Executive Summary\n\n`
  md += `Ran ${totalTests} tests across ${sectionNames.length} sections. `
  md += `**${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped.** `
  md += `Overall score: **${overallScore}%**.\n\n`
  if (failures.length > 0) {
    md += `Top issue: ${failures[0].section} — ${failures[0].name}.\n\n`
  }

  md += `## Results Matrix\n\n`
  md += `| # | Section | Tests | Pass | Fail | Skip | Score |\n`
  md += `|---|---------|-------|------|------|------|-------|\n`
  sections.forEach((s, i) => {
    const score = s.total - s.skip > 0 ? Math.round((s.pass / (s.total - s.skip)) * 100) : 0
    md += `| ${i + 1} | ${s.section} | ${s.total} | ${s.pass} | ${s.fail} | ${s.skip} | ${score}% |\n`
  })

  md += `\n## Detailed Findings\n\n`
  for (const s of sectionNames) {
    md += `### ${s}\n\n`
    for (const r of results.filter((r) => r.section === s)) {
      const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIP'
      md += `#### ${r.name} — ${icon}\n`
      md += `**Result:** ${r.detail}\n`
      if (r.screenshot) md += `**Screenshot:** ${r.screenshot}\n`
      if (r.suggestion) md += `**Suggestion:** ${r.suggestion}\n`
      md += `\n`
    }
  }

  if (failures.length > 0) {
    md += `## Priority Action Items\n\n`
    failures.forEach((f, i) => {
      md += `${i + 1}. **[${f.section}]** ${f.name} — ${f.detail}\n`
    })
    md += `\n`
  }

  if (suggestions.length > 0) {
    md += `## UX & Improvement Suggestions\n\n`
    suggestions.forEach((s) => {
      md += `- **${s.section} / ${s.name}:** ${s.suggestion}\n`
    })
    md += `\n`
  }

  return md
}

// ── Test sections (added in subsequent tasks) ────────────────────────────────

async function testPublicPages(page: Page): Promise<void> {
  const section = 'Public Pages'

  await test(section, 'Landing page loads', page, async () => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    const title = await page.title()
    if (!title) throw new Error('Page title is empty')
    const hero = await page.locator('text=Post-Market Surveillance').first()
    if (!(await hero.isVisible())) throw new Error('Hero text not visible')
    return { detail: `Title: "${title}", hero visible` }
  })

  await test(section, 'Pricing page renders tiers', page, async () => {
    await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'domcontentloaded' })
    const tiers = await page.locator('[class*="border"]').filter({ hasText: /Starter|Pro|Enterprise/ }).count()
    if (tiers < 3) throw new Error(`Expected 3+ plan tiers, found ${tiers}`)
    return { detail: `${tiers} plan tiers rendered` }
  })

  await test(section, 'Privacy page loads', page, async () => {
    await page.goto(`${BASE_URL}/privacy`, { waitUntil: 'domcontentloaded' })
    const heading = await page.locator('h1, h2').first().textContent()
    if (!heading?.toLowerCase().includes('privacy')) throw new Error('Privacy heading not found')
    return { detail: `Heading: "${heading}"` }
  })

  await test(section, 'Terms page loads', page, async () => {
    await page.goto(`${BASE_URL}/terms`, { waitUntil: 'domcontentloaded' })
    const heading = await page.locator('h1, h2').first().textContent()
    if (!heading?.toLowerCase().includes('terms')) throw new Error('Terms heading not found')
    return { detail: `Heading: "${heading}"` }
  })

  await test(section, 'DPA page loads', page, async () => {
    await page.goto(`${BASE_URL}/dpa`, { waitUntil: 'domcontentloaded' })
    const heading = await page.locator('h1, h2').first().textContent()
    if (!heading?.toLowerCase().includes('data processing')) throw new Error('DPA heading not found')
    return { detail: `Heading: "${heading}"` }
  })

  await test(section, 'Footer has correct contact email', page, async () => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    const mailto = await page.locator('a[href*="mailto:info@neuridion.eu"]').count()
    if (mailto === 0) throw new Error('No mailto link to info@neuridion.eu found')
    return { detail: `Found ${mailto} mailto link(s)` }
  })

  await test(section, 'Cookie banner appears', page, async () => {
    const ctx = await page.context().browser()!.newContext()
    const freshPage = await ctx.newPage()
    await freshPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await freshPage.waitForTimeout(1000)
    const banner = freshPage.locator('text=cookie').or(freshPage.locator('text=Cookie'))
    const visible = await banner.first().isVisible().catch(() => false)
    await freshPage.close()
    await ctx.close()
    if (!visible) throw new Error('Cookie banner not visible on fresh session')
    return { detail: 'Cookie banner appeared on fresh session' }
  })
}
async function testAuth(page: Page, browser: Browser): Promise<void> {
  const section = 'Authentication'

  await test(section, 'Login page renders OTP form', page, async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    const emailInput = page.locator('input[type="email"]')
    if (!(await emailInput.isVisible())) throw new Error('Email input not visible')
    return { detail: 'Login page rendered with email input' }
  })

  await test(section, 'OTP send and login', page, async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const otpInputs = await page.locator('input[inputmode="numeric"]').count()
    if (otpInputs === 0) throw new Error('OTP input fields did not appear after submitting email')

    const { data, error } = await adminDb.auth.admin.generateLink({
      type: 'magiclink',
      email: TEST_EMAIL,
    })
    if (error || !data) throw new Error(`Failed to generate OTP: ${error?.message ?? 'no data'}`)

    const token = data.properties?.hashed_token
    if (!token) {
      skip(section, 'OTP verification', 'Could not extract OTP token from admin API — manual login required')
      return { detail: 'OTP sent, but automated verification not available', suggestion: 'Consider adding a test-only OTP bypass endpoint for automated testing' }
    }

    return { detail: 'OTP form appeared after email submission', suggestion: 'Consider adding a test mode that auto-fills OTP for CI/CD' }
  })

  await test(section, 'Session-based login bypass', page, async () => {
    const { data: users } = await adminDb.auth.admin.listUsers()
    const testUser = users?.users?.find((u) => u.email === TEST_EMAIL)
    if (!testUser) throw new Error(`Test user ${TEST_EMAIL} not found in Supabase`)

    await page.goto(`${BASE_URL}/dashboard/search`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const url = page.url()

    if (url.includes('/login')) {
      const { data: linkData, error: linkError } = await adminDb.auth.admin.generateLink({
        type: 'magiclink',
        email: TEST_EMAIL,
      })
      if (linkError) throw new Error(`Link generation failed: ${linkError.message}`)

      const verifyUrl = linkData?.properties?.action_link
      if (verifyUrl) {
        const localUrl = verifyUrl.replace(/https?:\/\/[^/]+/, BASE_URL)
        await page.goto(localUrl, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2000)
      }

      await page.goto(`${BASE_URL}/dashboard/search`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const finalUrl = page.url()
      if (finalUrl.includes('/login')) throw new Error('Still redirected to login after session bypass')
    }

    return { detail: 'Successfully authenticated and reached dashboard' }
  })

  await test(section, 'Logout works', page, async () => {
    const logoutLink = page.locator('text=Log out').or(page.locator('a[href*="logout"]'))
    if (await logoutLink.first().isVisible()) {
      await logoutLink.first().click()
      await page.waitForTimeout(1500)
      const url = page.url()
      if (!url.includes('/login') && url !== `${BASE_URL}/`) throw new Error(`Expected redirect to login or home, got: ${url}`)
      return { detail: `Logged out, redirected to ${url}` }
    }
    throw new Error('Logout link not found')
  })
}
async function testDashboardLayout(page: Page): Promise<void> {
  const section = 'Dashboard Layout'

  await page.goto(`${BASE_URL}/dashboard/search`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (page.url().includes('/login')) {
    skip(section, 'Dashboard layout', 'Not authenticated — skipping dashboard tests')
    return
  }

  await test(section, 'Sidebar navigation links', page, async () => {
    const navLinks = ['Search', 'Profiles', 'Archive', 'Billing', 'Settings']
    const missing: string[] = []
    for (const link of navLinks) {
      const el = page.locator(`nav >> text=${link}`).or(page.locator(`aside >> text=${link}`)).or(page.locator(`a >> text=${link}`))
      if (!(await el.first().isVisible().catch(() => false))) missing.push(link)
    }
    if (missing.length > 0) throw new Error(`Missing nav links: ${missing.join(', ')}`)
    return { detail: `All ${navLinks.length} sidebar links visible` }
  })

  await test(section, 'Language selector visible', page, async () => {
    const langSelector = page.locator('text=English').or(page.locator('text=Deutsch')).or(page.locator('[class*="language"]'))
    const visible = await langSelector.first().isVisible().catch(() => false)
    if (!visible) throw new Error('Language selector not found')
    return { detail: 'Language selector visible' }
  })
}
async function testProfiles(page: Page): Promise<void> {
  const section = 'Profiles'

  await page.goto(`${BASE_URL}/dashboard/profiles`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  if (page.url().includes('/login')) { skip(section, 'All profile tests', 'Not authenticated'); return }

  await test(section, 'Profiles page loads', page, async () => {
    const heading = page.locator('text=Profiles').or(page.locator('text=Product Profiles'))
    if (!(await heading.first().isVisible().catch(() => false))) throw new Error('Profiles heading not visible')
    return { detail: 'Profiles page rendered' }
  })

  await test(section, 'New profile form accessible', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/profiles/new`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const deviceNameInput = page.locator('input[name="device_name"]').or(page.locator('label:has-text("Device") >> .. >> input'))
    const visible = await deviceNameInput.first().isVisible().catch(() => false)
    if (!visible) throw new Error('Device name input not found on new profile page')
    return { detail: 'New profile form rendered with device name field' }
  })

  await test(section, 'Existing profiles listed', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/profiles`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const profiles = await page.locator('[class*="border"], [class*="card"]').filter({ hasText: /B\. Braun|Medtronic|Infusomat|Micra/ }).count()
    if (profiles > 0) return { detail: `Found ${profiles} existing profiles` }
    const emptyState = page.locator('text=No profiles').or(page.locator('text=Create your first'))
    if (await emptyState.first().isVisible().catch(() => false)) return { detail: 'Empty state displayed (no profiles yet)' }
    throw new Error('Neither profiles nor empty state found')
  })
}
async function testSearch(page: Page): Promise<void> {
  const section = 'Search'

  await page.goto(`${BASE_URL}/dashboard/search`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  if (page.url().includes('/login')) { skip(section, 'All search tests', 'Not authenticated'); return }

  await test(section, 'Search panel renders', page, async () => {
    const profileSelector = page.locator('select').or(page.locator('[class*="select"]'))
    const visible = await profileSelector.first().isVisible().catch(() => false)
    if (!visible) throw new Error('Profile selector not visible')
    return { detail: 'Search panel rendered with profile selector' }
  })

  await test(section, 'Database checkboxes present', page, async () => {
    const dbs = ['BfArM', 'FDA', 'MHRA', 'Swissmedic']
    const found: string[] = []
    for (const db of dbs) {
      const label = page.locator(`text=${db}`)
      if (await label.first().isVisible().catch(() => false)) found.push(db)
    }
    if (found.length === 0) throw new Error('No database checkboxes found')
    return {
      detail: `${found.length}/4 databases visible: ${found.join(', ')}`,
      suggestion: found.length < 4 ? `Missing databases: ${dbs.filter(d => !found.includes(d)).join(', ')}` : undefined,
    }
  })

  await test(section, 'Date pickers present', page, async () => {
    const dateInputs = await page.locator('input[type="date"]').count()
    if (dateInputs < 2) throw new Error(`Expected 2 date pickers, found ${dateInputs}`)
    return { detail: `${dateInputs} date inputs found` }
  })

  await test(section, 'Run Search button present', page, async () => {
    const runBtn = page.locator('button:has-text("Run Search")').or(page.locator('button:has-text("Run")'))
    if (!(await runBtn.first().isVisible().catch(() => false))) throw new Error('Run Search button not visible')
    return { detail: 'Run Search button visible' }
  })
}
async function testReportGeneration(page: Page): Promise<void> {}
async function testArchive(page: Page): Promise<void> {}
async function testSettings(page: Page): Promise<void> {}
async function testBilling(page: Page): Promise<void> {}
async function testAdmin(page: Page): Promise<void> {}
async function testErrorHandling(page: Page): Promise<void> {}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 PRRC App Review — ${BASE_URL}\n`)

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  try {
    console.log('[1/11] Public Pages')
    await testPublicPages(page)

    console.log('[2/11] Authentication')
    await testAuth(page, browser)

    console.log('[3/11] Dashboard Layout')
    await testDashboardLayout(page)

    console.log('[4/11] Profiles')
    await testProfiles(page)

    console.log('[5/11] Search')
    await testSearch(page)

    console.log('[6/11] Report Generation')
    await testReportGeneration(page)

    console.log('[7/11] Archive')
    await testArchive(page)

    console.log('[8/11] Settings')
    await testSettings(page)

    console.log('[9/11] Billing')
    await testBilling(page)

    console.log('[10/11] Admin')
    await testAdmin(page)

    console.log('[11/11] Error Handling')
    await testErrorHandling(page)
  } finally {
    await browser.close()
  }

  const report = generateReport()
  const today = new Date().toISOString().slice(0, 10)
  const reportPath = path.join(REPORT_DIR, `PRRC-QA-Report-${today}.md`)
  fs.writeFileSync(reportPath, report)

  console.log(`\n📄 Report saved to ${reportPath}`)
  console.log(`   ${results.filter((r) => r.status === 'pass').length} pass / ${results.filter((r) => r.status === 'fail').length} fail / ${results.filter((r) => r.status === 'skip').length} skip\n`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
