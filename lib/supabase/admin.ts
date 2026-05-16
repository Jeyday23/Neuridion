import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let _client: SupabaseClient<Database> | null = null

/**
 * Service-role client — bypasses RLS.
 * Only use in trusted server contexts (webhooks, background jobs).
 * Never expose to the browser.
 *
 * Returns a lazy-initialized singleton to avoid creating a new client on every call.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  _client = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}
