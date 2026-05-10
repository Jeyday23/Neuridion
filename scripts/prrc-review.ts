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

async function testPublicPages(page: Page): Promise<void> {}
async function testAuth(page: Page, browser: Browser): Promise<void> {}
async function testDashboardLayout(page: Page): Promise<void> {}
async function testProfiles(page: Page): Promise<void> {}
async function testSearch(page: Page): Promise<void> {}
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
