function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendFeedbackNotification(feedback: {
  rating: number
  most_useful: string[]
  missing_features?: string | null
  triggered_by: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')

  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'
  const subject = `New Feedback — ${feedback.rating}/5 stars`
  const mostUseful = feedback.most_useful.length > 0 ? escHtml(feedback.most_useful.join(', ')) : 'not specified'
  const missing = escHtml(feedback.missing_features?.trim() || 'not specified')
  const submittedAt = new Date().toISOString()

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#0F1F3D">Neuridion</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  <p style="margin:4px 0"><strong>Rating:</strong> ${'★'.repeat(feedback.rating)}${'☆'.repeat(5 - feedback.rating)} (${feedback.rating}/5)</p>
  <p style="margin:4px 0"><strong>Most useful:</strong> ${mostUseful}</p>
  <p style="margin:4px 0"><strong>Missing features:</strong> ${missing}</p>
  <p style="margin:4px 0"><strong>Triggered by:</strong> ${escHtml(feedback.triggered_by)}</p>
  <p style="margin:4px 0"><strong>Submitted at:</strong> ${submittedAt}</p>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: 'info@neuridion.eu', subject, html }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Resend API error ${res.status}: ${text}`)
  }
}

export interface SearchRunSummary {
  deviceName: string
  manufacturer: string
  periodFrom: string
  periodTo: string
  relevantCount: number
  uncertainCount: number
  excludedCount: number
  runId: string
}

export async function sendSearchRunNotification(
  toEmail: string,
  summary: SearchRunSummary,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const archiveUrl = `${appUrl}/dashboard/archive`

  const total = summary.relevantCount + summary.uncertainCount + summary.excludedCount
  const actionable = summary.relevantCount + summary.uncertainCount
  const subject = actionable > 0
    ? `[Neuridion] ${actionable} notice${actionable !== 1 ? 's' : ''} require attention — ${summary.deviceName}`
    : `[Neuridion] Search complete — ${summary.deviceName}`

  const lines: string[] = [
    `Your recall search for <strong>${escHtml(summary.deviceName)}</strong> (${escHtml(summary.manufacturer)}) has completed.`,
    '',
    `<strong>Period:</strong> ${summary.periodFrom} → ${summary.periodTo}`,
    `<strong>Total notices found:</strong> ${total}`,
  ]

  if (summary.relevantCount > 0) {
    lines.push(`<strong style="color:#15803d">Relevant:</strong> ${summary.relevantCount}`)
  }
  if (summary.uncertainCount > 0) {
    lines.push(`<strong style="color:#b45309">Uncertain (manual review required):</strong> ${summary.uncertainCount}`)
  }
  if (summary.excludedCount > 0) {
    lines.push(`<strong style="color:#71717a">Excluded:</strong> ${summary.excludedCount}`)
  }

  lines.push('', `<a href="${archiveUrl}">View results in Neuridion →</a>`)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#0F1F3D">Neuridion</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  ${lines.map((l) => l === '' ? '<br>' : `<p style="margin:4px 0">${l}</p>`).join('\n  ')}
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px">
  <p style="margin:0;font-size:12px;color:#6B7280">You are receiving this because email notifications are enabled on your Neuridion account.</p>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: toEmail, subject, html }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Resend API error ${res.status}: ${text}`)
  }
}

export interface ScraperHealthResult {
  source: string
  healthy: boolean
  itemCount: number
  error?: string
  warnings?: string[]
  durationMs: number
}

export async function sendScraperHealthAlert(
  results: ScraperHealthResult[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'

  const degradedCount = results.filter((r) => !r.healthy).length
  const subject = `[Neuridion] Scraper health alert — ${degradedCount} source${degradedCount !== 1 ? 's' : ''} degraded`

  const tableRows = results
    .map((r) => {
      const status = r.healthy ? '&#9989;' : '&#10060;'
      const errorCell = r.error ? escHtml(r.error) : ''
      const warningCell =
        r.warnings && r.warnings.length > 0
          ? r.warnings.map((w) => escHtml(w)).join('<br>')
          : ''
      const detail = [errorCell, warningCell].filter(Boolean).join('<br>')

      return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0">${status}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;font-weight:600">${escHtml(r.source)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;text-align:right">${r.itemCount}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;text-align:right">${r.durationMs.toLocaleString()}ms</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#71717a">${detail}</td>
    </tr>`
    })
    .join('\n    ')

  const checkedAt = new Date().toISOString()

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:600px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#0F1F3D">Neuridion</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  <p style="margin:4px 0"><strong>${degradedCount} of ${results.length} scraper source${results.length !== 1 ? 's' : ''} reported degraded.</strong></p>
  <p style="margin:4px 0">Checked at: ${checkedAt}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
    <thead>
      <tr style="background:#F8FAFC">
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #E2E8F0">Status</th>
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #E2E8F0">Source</th>
        <th style="padding:6px 10px;text-align:right;border-bottom:2px solid #E2E8F0">Items</th>
        <th style="padding:6px 10px;text-align:right;border-bottom:2px solid #E2E8F0">Duration</th>
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #E2E8F0">Detail</th>
      </tr>
    </thead>
    <tbody>
    ${tableRows}
    </tbody>
  </table>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px">
  <p style="margin:0;font-size:12px;color:#6B7280">Automated scraper health check — Neuridion PMS monitoring.</p>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: 'info@neuridion.eu', subject, html }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Resend API error ${res.status}: ${text}`)
  }
}
