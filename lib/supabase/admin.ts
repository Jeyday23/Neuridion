import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Service-role client — bypasses RLS.
 * Only use in trusted server contexts (webhooks, background jobs).
 * Never expose to the browser.
 */
export function createAdminClient() {
  if (process.env.NODE_ENV === 'development') {
    console.log('[ADMIN_CLIENT] created from:', new Error().stack?.split('\n')[2]?.trim())
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
