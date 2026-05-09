'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

export type LoginState = { error: string } | null

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email    = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const h  = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  const rateCheck = await checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return { error: 'Too many attempts. Try again in 15 min.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  await recordLoginAttempt(ip, email, !error)

  if (error) {
    console.error('[login]', error.message)
    return { error: 'Invalid email or password.' }
  }

  await logAuditEvent(data.user?.id ?? null, 'login', { email })

  const adminClient = createAdminClient()
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single()

  const redirectPath = userRow?.role === 'admin' ? '/admin' : '/dashboard/search'
  redirect(redirectPath)
}
