import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'

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

export async function logAuditEvent(
  userId: string | null,
  eventType: AuditEventType,
  eventData?: Record<string, unknown>,
  req?: Request,
): Promise<void> {
  try {
    const admin   = createAdminClient()
    const hdrs    = req?.headers
    await admin.from('audit_log').insert({
      user_id:    userId,
      event_type: eventType,
      event_data: (eventData ?? null) as Json,
      ip_address: hdrs?.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
      user_agent: hdrs?.get('user-agent') ?? null,
    })
  } catch (err) {
    console.error('[audit] failed:', err)
    // Never throw — audit failure must not block user action
  }
}
