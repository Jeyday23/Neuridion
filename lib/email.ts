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
  const mostUseful = feedback.most_useful.length > 0 ? feedback.most_useful.join(', ') : 'not specified'
  const missing = feedback.missing_features?.trim() || 'not specified'
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
  <p style="margin:4px 0"><strong>Triggered by:</strong> ${feedback.triggered_by}</p>
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
  const from = process.env.RESEND_FROM_ADDRESS ?? 'Kodex <noreply@kodex.io>'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const archiveUrl = `${appUrl}/dashboard/archive`

  const total = summary.relevantCount + summary.uncertainCount + summary.excludedCount
  const actionable = summary.relevantCount + summary.uncertainCount
  const subject = actionable > 0
    ? `[Kodex] ${actionable} notice${actionable !== 1 ? 's' : ''} require attention — ${summary.deviceName}`
    : `[Kodex] Search complete — ${summary.deviceName}`

  const lines: string[] = [
    `Your recall search for <strong>${summary.deviceName}</strong> (${summary.manufacturer}) has completed.`,
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

  lines.push('', `<a href="${archiveUrl}">View results in Kodex →</a>`)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#18181b">Kodex</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:12px 0 20px">
  ${lines.map((l) => l === '' ? '<br>' : `<p style="margin:4px 0">${l}</p>`).join('\n  ')}
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px">
  <p style="margin:0;font-size:12px;color:#a1a1aa">You are receiving this because email notifications are enabled on your Kodex account.</p>
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
