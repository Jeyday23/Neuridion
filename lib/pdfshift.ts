import type { SupabaseClient } from '@supabase/supabase-js'
import { chromium, type Browser } from 'playwright'

const MONTHLY_LIMIT = 45  // global cap
const PER_USER_LIMIT = 15 // prevents a single user from burning all quota

/* ── Singleton browser instance (reused across requests to avoid cold starts) ── */

let browserPromise: Promise<Browser> | null = null

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return browserPromise
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
    })
    return Buffer.from(pdfBuffer)
  } finally {
    await page.close()
  }
}

export async function canGeneratePdf(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const month = new Date().toISOString().slice(0, 7)  // '2026-04'

  const { data: allUsage } = await adminClient
    .from('pdf_usage')
    .select('count')
    .eq('month', month)

  const totalThisMonth = (allUsage ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
  if (totalThisMonth >= MONTHLY_LIMIT) {
    return { allowed: false, reason: 'monthly_limit_reached' }
  }

  const { data: userUsage } = await adminClient
    .from('pdf_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle()

  if (userUsage && (userUsage as { count: number }).count >= PER_USER_LIMIT) {
    return { allowed: false, reason: 'user_limit_reached' }
  }

  return { allowed: true }
}

export async function incrementPdfUsage(
  adminClient: SupabaseClient,
  userId: string
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7)
  await adminClient.rpc('increment_pdf_usage', { p_user_id: userId, p_month: month })
}
