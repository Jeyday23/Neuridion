import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSecurityAlert } from '@/lib/security-alerts'
import type { Json } from '@/types/supabase'

function anonymizeIp(ip: string): string {
  if (ip.includes(':')) return ip.replace(/:[^:]*$/, ':0')
  return ip.replace(/\.\d+$/, '.0')
}

const AUDIT_HMAC_KEY = process.env.AUDIT_HMAC_KEY || 'neuridion-default-audit-key'

function hashPii(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data }
  if (typeof out.email === 'string') {
    out.email_hash = createHmac('sha256', AUDIT_HMAC_KEY)
      .update(out.email.toLowerCase())
      .digest('hex')
      .slice(0, 32)
    delete out.email
  }
  return out
}

type AuditEventType =
  | 'login'
  | 'logout'
  | 'signup'
  | 'search_run'
  | 'report_generated'
  | 'report_downloaded'
  | 'account_deleted'
  | 'data_exported'
  | 'password_changed'
  | 'admin_action'
  | 'prrc_review_completed'
  | 'profile_created'
  | 'profile_updated'
  | 'profile_deleted'
  | 'consent_withdrawn'
  | 'consent_granted'
  | 'search_run_deleted'
  | 'self_approval_override'
  | 'billing_event'
  | 'account_deletion_cancelled'
  | 'preference_changed'
  | 'search_run_cancelled'

export async function logAuditEvent(
  userId: string | null,
  eventType: AuditEventType,
  eventData?: Record<string, unknown>,
  req?: Request,
): Promise<void> {
  try {
    const admin   = createAdminClient()
    const hdrs    = req?.headers
    const rawIp   = hdrs?.get('x-forwarded-for')?.split(',')[0].trim() ?? null
    const safeData = eventData ? hashPii(eventData) : null
    await admin.from('audit_log').insert({
      user_id:    userId,
      event_type: eventType,
      event_data: (safeData ?? null) as Json,
      ip_address: rawIp ? anonymizeIp(rawIp) : null,
      user_agent: hdrs?.get('user-agent') ?? null,
    })
    const alertIp = rawIp ? anonymizeIp(rawIp) : null
    checkSecurityAlert(eventType, safeData ?? null, alertIp).catch(() => {})
  } catch (err) {
    console.error('[audit] failed:', err instanceof Error ? err.message : String(err))
    // Never throw — audit failure must not block user action
  }
}
