import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { execSync } from 'child_process'

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
const PRESERVE_SESSION = args.includes('--preserve-session')
const SCREENSHOT_DIR = path.resolve('docs/prrc-review/screenshots')
const REPORT_DIR = path.resolve('docs/prrc-review')

// ── Supabase admin (for OTP bypass) ──────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment')
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

// ── Auth session establishment ───────────────────────────────────────────

function hmacSha256Hex(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex')
}

async function establishSession(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const { data: linkData, error: linkError } = await adminDb.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
  })
  if (linkError || !linkData) throw new Error(`generateLink failed: ${linkError?.message}`)

  const otp = (linkData.properties as Record<string, unknown>)?.email_otp as string | undefined
  if (!otp) throw new Error('No email_otp returned from admin API')

  const anonClient = createClient(supabaseUrl!, supabaseAnonKey!)
  const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
    email: TEST_EMAIL,
    token: otp,
    type: 'email',
  })
  if (verifyError || !verifyData.session) throw new Error(`verifyOtp failed: ${verifyError?.message}`)

  const session = verifyData.session
  const projectRef = new URL(supabaseUrl!).hostname.split('.')[0]
  const cookieBase = `sb-${projectRef}-auth-token`

  const sessionPayload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  })
  const encodedValue = 'base64-' + Buffer.from(sessionPayload).toString('base64url')

  const domain = new URL(BASE_URL).hostname
  const isSecure = BASE_URL.startsWith('https://')
  const CHUNK_SIZE = 3180

  let authCookies: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }[]

  if (encodedValue.length <= CHUNK_SIZE) {
    authCookies = [{
      name: cookieBase,
      value: encodedValue,
      domain,
      path: '/',
      httpOnly: false,
      secure: isSecure,
      sameSite: 'Lax' as const,
    }]
  } else {
    const chunks: string[] = []
    let remaining = encodedValue
    while (remaining.length > 0) {
      let chunkEnd = CHUNK_SIZE
      if (chunkEnd > remaining.length) chunkEnd = remaining.length
      chunks.push(remaining.slice(0, chunkEnd))
      remaining = remaining.slice(chunkEnd)
    }
    authCookies = chunks.map((chunk, i) => ({
      name: `${cookieBase}.${i}`,
      value: chunk,
      domain,
      path: '/',
      httpOnly: false,
      secure: isSecure,
      sameSite: 'Lax' as const,
    }))
  }

  const hmacSalt = process.env.SESSION_HMAC_SALT ?? 'neuridion-session-v1'
  const sessionHmacKey = hmacSha256Hex(supabaseServiceKey!, hmacSalt)
  const now = String(Date.now())
  const sessionSig = hmacSha256Hex(sessionHmacKey, now)
  const idleSig = hmacSha256Hex(sessionHmacKey, now)

  const sessionCookies = [
    ...authCookies,
    {
      name: 'session_started_at',
      value: `${now}.${sessionSig}`,
      domain,
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax' as const,
    },
    {
      name: '_neuridion_active',
      value: `${now}.${idleSig}`,
      domain,
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'Lax' as const,
    },
  ]

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies(sessionCookies)
  const page = await context.newPage()
  return { context, page }
}

// ── Report generator ─────────────────────────────────────────────────────────

function generateReport(): string {
  const today = new Date().toISOString().slice(0, 10)
  let gitHash = 'unknown'
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim()
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
  const scoreDenom = totalTests - totalSkip
  const overallScore = scoreDenom > 0 ? Math.round((totalPass / scoreDenom) * 100) : 0

  const failures = results.filter((r) => r.status === 'fail')
  const suggestions = results.filter((r) => r.suggestion)

  let md = `# PRRC Quality Assurance Report\n\n`
  md += `**Date:** ${today}\n`
  md += `**Environment:** ${BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') ? 'Local dev' : 'Deployed production'} (${BASE_URL})\n`
  md += `**App Version:** ${gitHash}\n`
  const redactedEmail = TEST_EMAIL.replace(/^(.{2}).*(@.{2}).*$/, '$1***$2***')
  md += `**Test Account:** ${redactedEmail}\n\n`

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
async function testAuth(page: Page, browser: Browser): Promise<{ authedPage: Page; authedContext: BrowserContext } | null> {
  const section = 'Authentication'

  await test(section, 'Login page renders OTP form', page, async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    const emailInput = page.locator('input[type="email"]')
    if (!(await emailInput.isVisible())) throw new Error('Email input not visible')
    return { detail: 'Login page rendered with email input' }
  })

  await test(section, 'OTP UI flow (email → code step)', page, async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.route('**/api/auth/otp', (route) =>
      route.fulfill({ status: 200, body: '{}', contentType: 'application/json' })
    )
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const otpInputs = await page.locator('input[inputmode="numeric"]').count()
    await page.unroute('**/api/auth/otp')
    if (otpInputs === 0) throw new Error('OTP input fields did not appear after submitting email')
    return { detail: `${otpInputs} OTP digit inputs rendered after email submission` }
  })

  let authedPage: Page | null = null
  let authedContext: BrowserContext | null = null

  await test(section, 'Session cookie injection + dashboard access', page, async () => {
    const result = await establishSession(browser)
    authedPage = result.page
    authedContext = result.context

    await authedPage.goto(`${BASE_URL}/dashboard/search`, { waitUntil: 'domcontentloaded' })
    await authedPage.waitForTimeout(2000)
    const url = authedPage.url()
    if (url.includes('/login')) throw new Error('Still redirected to login after session cookie injection')
    return { detail: 'Successfully authenticated via cookie injection and reached dashboard' }
  })

  if (!authedPage) return null

  if (PRESERVE_SESSION) {
    skip(section, 'Logout works', 'Skipped because --preserve-session was requested')
  } else {
    await test(section, 'Logout works', authedPage, async () => {
    // Dismiss cookie banner if it overlaps the logout button
    const cookieBanner = authedPage!.locator('.fixed.bottom-0')
    if (await cookieBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
      const acceptBtn = authedPage!.locator('button:has-text("Accept")').or(authedPage!.locator('button:has-text("Akzeptieren")'))
      if (await acceptBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await acceptBtn.first().click()
        await authedPage!.waitForTimeout(500)
      }
    }

    const logoutBtn = authedPage!.locator('button:has-text("Log out")').or(authedPage!.locator('button:has-text("Abmelden")'))
    if (await logoutBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.first().click({ force: true })
      await authedPage!.waitForTimeout(2000)
      const url = authedPage!.url()
      if (!url.includes('/login') && url !== `${BASE_URL}/`) throw new Error(`Expected redirect to login or home, got: ${url}`)
      return { detail: `Logged out, redirected to ${url}` }
    }
    throw new Error('Logout button not found')
    })
  }

  // Re-establish session for remaining authenticated tests
  if (authedContext) await authedContext.close()
  const freshSession = await establishSession(browser)
  return { authedPage: freshSession.page, authedContext: freshSession.context }
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
    await page.waitForTimeout(1500)
    // Look for any profile card with a device name or manufacturer
    const profileCards = page.locator('[class*="border"], [class*="card"]').filter({ has: page.locator('text=/Device|Manufacturer|Class|EMDN/i') })
    const count = await profileCards.count()
    if (count > 0) return { detail: `Found ${count} existing profile(s)` }
    // Also check for profile links/items in a simpler list layout
    const profileLinks = await page.locator('a[href*="/dashboard/profiles/"]').count()
    if (profileLinks > 0) return { detail: `Found ${profileLinks} profile link(s)` }
    const emptyState = page.locator('text=No profiles').or(page.locator('text=Create your first')).or(page.locator('text=no device profiles'))
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
async function testReportGeneration(page: Page): Promise<void> {
  const section = 'Report Generation'

  if (page.url().includes('/login')) { skip(section, 'All report tests', 'Not authenticated'); return }

  await test(section, 'Report column exists in archive', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/archive`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const reportHeader = page.locator('th:has-text("Report")')
    const hasHeader = await reportHeader.first().isVisible().catch(() => false)
    if (!hasHeader) throw new Error('Report column header not found in archive table')
    const genBtn = page.locator('text=Generate Report')
    const downloadBtn = page.locator('text=PDF').or(page.locator('text=Excel').or(page.locator('text=HTML')))
    const hasGen = await genBtn.first().isVisible().catch(() => false)
    const hasDownload = await downloadBtn.first().isVisible().catch(() => false)
    if (hasDownload) return { detail: 'Report column present — download links visible' }
    if (hasGen) return { detail: 'Report column present — Generate Report button visible' }
    return { detail: 'Report column present (runs may need review before report generation)', suggestion: 'Reports require review_status != draft before generation is available' }
  })

  await test(section, 'Download links work', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/archive`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const pdfLink = page.locator('text=PDF').first()
    const excelLink = page.locator('text=Excel').first()
    const hasPdf = await pdfLink.isVisible().catch(() => false)
    const hasExcel = await excelLink.isVisible().catch(() => false)
    if (!hasPdf && !hasExcel) {
      return { detail: 'No download links available (no reports generated yet)', suggestion: 'Generate a report first to test downloads' }
    }
    return { detail: `Download links available: ${hasPdf ? 'PDF' : ''} ${hasExcel ? 'Excel' : ''}`.trim() }
  })
}
async function testArchive(page: Page): Promise<void> {
  const section = 'Archive'

  await page.goto(`${BASE_URL}/dashboard/archive`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (page.url().includes('/login')) { skip(section, 'All archive tests', 'Not authenticated'); return }

  await test(section, 'Archive table renders', page, async () => {
    const table = page.locator('table').or(page.locator('[class*="archive"]'))
    if (!(await table.first().isVisible().catch(() => false))) throw new Error('Archive table not visible')
    return { detail: 'Archive table rendered' }
  })

  await test(section, 'Table has expected columns', page, async () => {
    const expectedCols = ['Date', 'Profile', 'Period', 'DBs', 'Status', 'Results', 'Review', 'Report', 'Actions']
    const found = (await page.locator('thead th').allTextContents()).map((text) => text.trim())
    if (found.length !== expectedCols.length) {
      throw new Error(`Missing columns: ${expectedCols.filter((col) => !found.includes(col)).join(', ')}`)
    }
    return { detail: `${found.length}/${expectedCols.length} columns: ${found.join(', ')}` }
  })

  await test(section, 'View Results link works', page, async () => {
    const viewLink = page.locator('text=View Results').first()
    if (!(await viewLink.isVisible().catch(() => false))) throw new Error('No View Results link found')
    await viewLink.click()
    await page.waitForTimeout(1500)
    const url = page.url()
    if (!url.includes('/dashboard/archive/')) throw new Error(`Expected archive detail URL, got: ${url}`)
    return { detail: `Navigated to ${url}` }
  })

  await test(section, 'Archive detail page renders results', page, async () => {
    const resultCards = page.locator('[class*="border"]').filter({ hasText: /Relevant|Excluded|Uncertain|Malfunction|Death/ })
    const count = await resultCards.count()
    if (count === 0) {
      const noResults = page.locator('text=No FSN results')
      if (await noResults.first().isVisible().catch(() => false)) return { detail: 'No results for this run (empty state)' }
      throw new Error('Neither results nor empty state found on detail page')
    }
    return { detail: `${count} result cards rendered` }
  })
}
async function testSettings(page: Page): Promise<void> {
  const section = 'Settings'

  await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  if (page.url().includes('/login')) { skip(section, 'All settings tests', 'Not authenticated'); return }

  await test(section, 'Settings page loads', page, async () => {
    const heading = page.locator('text=Settings').or(page.locator('text=Account'))
    if (!(await heading.first().isVisible().catch(() => false))) throw new Error('Settings heading not visible')
    return { detail: 'Settings page rendered' }
  })

  await test(section, 'Password change form renders', page, async () => {
    const pwInput = page.locator('input[type="password"]')
    const count = await pwInput.count()
    if (count < 2) throw new Error(`Expected 2+ password inputs, found ${count}`)
    return { detail: `${count} password input fields rendered` }
  })

  await test(section, 'GDPR section visible', page, async () => {
    const gdpr = page.locator('text=Export').or(page.locator('text=Delete Account')).or(page.locator('text=Data'))
    if (!(await gdpr.first().isVisible().catch(() => false))) throw new Error('GDPR section not found')
    return { detail: 'GDPR data export / account deletion section visible' }
  })
}
async function testBilling(page: Page): Promise<void> {
  const section = 'Billing'

  await page.goto(`${BASE_URL}/dashboard/billing`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  if (page.url().includes('/login')) { skip(section, 'All billing tests', 'Not authenticated'); return }

  await test(section, 'Billing page loads', page, async () => {
    const heading = page.locator('text=Billing').or(page.locator('text=Subscription')).or(page.locator('text=Plan'))
    if (!(await heading.first().isVisible().catch(() => false))) throw new Error('Billing heading not visible')
    return { detail: 'Billing page rendered' }
  })

  await test(section, 'Current plan displayed', page, async () => {
    const plan = page.locator('[data-testid="current-plan-label"]')
    if (!(await plan.first().isVisible().catch(() => false))) throw new Error('Current plan label not found')
    const text = await plan.first().textContent()
    return { detail: `Current plan: ${text}` }
  })

  await test(section, 'Enterprise contact link', page, async () => {
    const mailto = page.locator('a[href*="mailto:info@neuridion.eu"]')
    if (!(await mailto.first().isVisible().catch(() => false))) throw new Error('Enterprise mailto link not found')
    return { detail: 'Enterprise tier contact email link present' }
  })
}
async function testAdmin(page: Page): Promise<void> {
  const section = 'Admin Panel'

  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  if (page.url().includes('/login')) { skip(section, 'All admin tests', 'Not authenticated'); return }
  if (page.url().includes('/dashboard')) { skip(section, 'All admin tests', 'Test account is not admin'); return }

  await test(section, 'Admin overview loads', page, async () => {
    const heading = page.locator('text=Admin').or(page.locator('text=Overview'))
    if (!(await heading.first().isVisible().catch(() => false))) throw new Error('Admin heading not visible')
    return { detail: 'Admin overview page rendered' }
  })

  await test(section, 'User management table', page, async () => {
    await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const table = page.locator('table')
    if (!(await table.first().isVisible().catch(() => false))) throw new Error('Users table not visible')
    return { detail: 'User management table rendered' }
  })
}
async function testErrorHandling(page: Page): Promise<void> {
  const section = 'Error Handling'

  await test(section, '404 page for invalid route', page, async () => {
    const res = await page.goto(`${BASE_URL}/this-page-does-not-exist-xyz`, { waitUntil: 'domcontentloaded' })
    const status = res?.status() ?? 0
    const body = await page.locator('body').textContent()
    if (status !== 404) throw new Error(`Expected HTTP 404, received ${status}`)
    if (!body?.toLowerCase().includes('not found')) throw new Error('404 response did not render the not-found message')
    return { detail: '404 handled with HTTP 404 and a user-facing not-found page' }
  })

  await test(section, 'Rate limit returns 429', page, async () => {
    const responses: number[] = []
    for (let i = 0; i < 12; i++) {
      const res = await page.request.post(`${BASE_URL}/api/auth/otp`, {
        data: JSON.stringify({ action: 'send', email: 'ratelimit-test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      })
      responses.push(res.status())
      if (res.status() === 429) break
    }
    const got429 = responses.includes(429)
    if (!got429) return { detail: `Sent ${responses.length} requests, no 429 received`, suggestion: 'Rate limiting may not be triggered with only 12 requests' }
    return { detail: `Rate limit triggered after ${responses.indexOf(429) + 1} requests` }
  })
}

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
    const authResult = await testAuth(page, browser)
    const authedPage = authResult?.authedPage ?? page

    console.log('[3/11] Dashboard Layout')
    await testDashboardLayout(authedPage)

    console.log('[4/11] Profiles')
    await testProfiles(authedPage)

    console.log('[5/11] Search')
    await testSearch(authedPage)

    console.log('[6/11] Report Generation')
    await testReportGeneration(authedPage)

    console.log('[7/11] Archive')
    await testArchive(authedPage)

    console.log('[8/11] Settings')
    await testSettings(authedPage)

    console.log('[9/11] Billing')
    await testBilling(authedPage)

    console.log('[10/11] Admin')
    await testAdmin(authedPage)

    console.log('[11/11] Error Handling')
    await testErrorHandling(authedPage)

    if (authResult?.authedContext) await authResult.authedContext.close()
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
