import type { SupabaseClient } from '@supabase/supabase-js'

const PDFSHIFT_API_URL = 'https://api.pdfshift.io/v3/convert/pdf'
const MONTHLY_LIMIT = 45  // global cap — stay under 50-conversion free tier
const PER_USER_LIMIT = 15 // prevents a single user from burning all credits

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const apiKey = process.env.PDFSHIFT_API_KEY
  if (!apiKey) {
    throw new Error('PDFSHIFT_API_KEY is not configured')
  }

  const response = await fetch(PDFSHIFT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: html,
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      sandbox: false,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('[PDF]', `PDFShift ${response.status}: ${errText}`)
    throw new Error('PDF generation failed')
  }

  return Buffer.from(await response.arrayBuffer())
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
