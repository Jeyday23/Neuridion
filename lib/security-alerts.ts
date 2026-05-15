import { rateLimit } from '@/lib/rate-limit'
import { escHtml } from '@/lib/utils/html'

const ALERT_EMAIL = process.env.SECURITY_ALERT_EMAIL
const RESEND_KEY  = process.env.RESEND_API_KEY

const ALERT_TRIGGERS: Record<string, { threshold: number; windowMs: number }> = {
  admin_action:    { threshold: 1,  windowMs: 60 * 1000 },
  account_deleted: { threshold: 1,  windowMs: 60 * 1000 },
  data_exported:   { threshold: 1,  windowMs: 60 * 1000 },
}

export async function checkSecurityAlert(
  eventType: string,
  eventData: Record<string, unknown> | null,
  ip: string | null,
): Promise<void> {
  if (!ALERT_EMAIL || !RESEND_KEY) return

  const trigger = ALERT_TRIGGERS[eventType]
  if (!trigger) return

  const rateKey = `sec-alert:${eventType}:${ip ?? 'no-ip'}`
  const { allowed } = await rateLimit(rateKey, trigger.threshold, trigger.windowMs)
  if (allowed) return

  const dedupKey = `sec-alert-sent:${eventType}:${ip ?? 'no-ip'}`
  const { allowed: notYetSent } = await rateLimit(dedupKey, 1, trigger.windowMs)
  if (!notYetSent) return

  await sendAlertEmail(
    `[Neuridion Security] ${eventType} alert`,
    eventType,
    ip,
    eventData,
  )
}

export async function checkFailedLoginAlert(ip: string): Promise<void> {
  if (!ALERT_EMAIL || !RESEND_KEY) return

  const rateKey = `sec-alert:login-fail:${ip}`
  const { allowed } = await rateLimit(rateKey, 10, 15 * 60 * 1000)
  if (allowed) return

  const dedupKey = `sec-alert-sent:login-fail:${ip}`
  const { allowed: notYetSent } = await rateLimit(dedupKey, 1, 15 * 60 * 1000)
  if (!notYetSent) return

  await sendAlertEmail(
    '[Neuridion Security] Brute-force login attempt detected',
    'Brute-force login attempt',
    ip,
    { threshold: '10+ failed attempts in 15 minutes' },
  )
}

async function sendAlertEmail(
  subject: string,
  event: string,
  ip: string | null,
  details: Record<string, unknown> | null,
): Promise<void> {
  const from = process.env.RESEND_FROM_ADDRESS ?? 'Neuridion <noreply@neuridion.eu>'
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;max-width:480px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;color:#DC2626">Security Alert</p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0 20px">
  <p><strong>Event:</strong> ${escHtml(event)}</p>
  <p><strong>IP:</strong> ${escHtml(ip ?? 'unknown')}</p>
  <p><strong>Time:</strong> ${new Date().toISOString()}</p>
  <p><strong>Details:</strong> ${escHtml(JSON.stringify(details ?? {}))}</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px">
  <p style="font-size:12px;color:#6B7280">Automated security alert — Neuridion PMS</p>
</body></html>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: ALERT_EMAIL, subject, html }),
    })
  } catch {
    // Alert failure must never block the user action
  }
}
