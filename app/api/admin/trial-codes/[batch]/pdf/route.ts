import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import QRCode from 'qrcode'
import { rateLimit } from '@/lib/rate-limit'

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL must be set')
  return url.replace(/\/$/, '')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batch: string }> }
) {
  const adminUser = await checkIsAdmin()
  if (!adminUser) return new Response('Forbidden', { status: 403 })

  const rl = await rateLimit(`trial-codes-pdf:${adminUser.id}`, 10, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { batch } = await params
  const batchName = decodeURIComponent(batch)

  const admin = createAdminClient()
  const { data: codes, error } = await admin
    .from('trial_codes')
    .select('code, redeemed_at, expires_at')
    .eq('batch_name', batchName)
    .is('redeemed_at', null) // only unused codes
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[trial-codes:pdf]', error.message)
    return new Response('Something went wrong', { status: 500 })
  }
  if (!codes?.length) return new Response('No available codes in this batch', { status: 404 })

  // Generate SVG for each code
  const codeBlocks = await Promise.all(
    (codes ?? []).map(async (row) => {
      const url = `${getBaseUrl()}/claim/${row.code}`
      const svg = await QRCode.toString(url, { type: 'svg', width: 160, margin: 1 })
      const expires = row.expires_at
        ? `Expires ${new Date(row.expires_at).toLocaleDateString('en-GB')}`
        : ''
      return `
        <div class="code-card">
          ${svg}
          <div class="code-text">${row.code}</div>
          <div class="tagline">Neuridion — 1 Free Search</div>
          ${expires ? `<div class="expires">${expires}</div>` : ''}
        </div>`
    })
  )

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Trial Codes — ${escHtml(batchName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #fff; }
    h1 { font-size: 14px; color: #555; padding: 6mm 10mm 4mm; border-bottom: 0.5pt solid #ccc; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4mm;
      padding: 4mm 10mm;
    }
    .code-card {
      text-align: center;
      padding: 3mm 2mm;
      border: 0.5pt solid #e5e7eb;
      border-radius: 2mm;
      page-break-inside: avoid;
    }
    .code-card svg { width: 100%; height: auto; display: block; }
    .code-text {
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 0.5pt;
      color: #111;
      margin-top: 2mm;
    }
    .tagline {
      font-size: 7pt;
      color: #6b7280;
      margin-top: 1mm;
    }
    .expires {
      font-size: 6.5pt;
      color: #ef4444;
      margin-top: 0.5mm;
    }
    @page { size: A4 portrait; margin: 10mm; }
    @media print {
      h1 { padding: 0 0 3mm 0; }
      .grid { padding: 3mm 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding:8px 16px;background:#f3f4f6;border-bottom:1px solid #d1d5db;font-size:13px;color:#374151;">
    <strong>${escHtml(batchName)}</strong> — ${codes.length} unredeemed codes.
    <button onclick="window.print()" style="margin-left:12px;padding:4px 14px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
      Print / Save PDF
    </button>
  </div>
  <h1>Neuridion — Trial Codes | Batch: ${escHtml(batchName)} | ${new Date().toLocaleDateString('en-GB')}</h1>
  <div class="grid">
    ${codeBlocks.join('\n')}
  </div>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
