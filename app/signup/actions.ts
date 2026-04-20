'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { checkLoginRateLimit, recordLoginAttempt } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

export type SignupState = { error: string } | null

function validatePassword(pw: string): string | null {
  if (pw.length < 10)           return 'Password must be at least 10 characters'
  if (!/[A-Z]/.test(pw))        return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(pw))        return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(pw))        return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain a special character'
  return null
}

export async function signup(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email       = (formData.get('email') as string)?.trim()
  const password    = formData.get('password') as string
  const fullName    = (formData.get('full_name') as string)?.trim()
  const companyName = (formData.get('company_name') as string)?.trim()

  if (!email || !password || !fullName || !companyName) {
    return { error: 'All fields are required.' }
  }

  const pwError = validatePassword(password)
  if (pwError) return { error: pwError }

  const h  = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  const rateCheck = await checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return { error: 'Too many attempts. Try again in 15 min.' }
  }

  const supabase = await createClient()
  await supabase.auth.signOut()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name:    fullName,
        company_name: companyName,
      },
    },
  })

  await recordLoginAttempt(ip, email, !error)

  if (error) {
    return { error: error.message }
  }

  await logAuditEvent(data.user?.id ?? null, 'signup', { email })

  // session is null when Supabase requires email confirmation
  if (!data.session) {
    redirect('/signup/confirm')
  }

  redirect('/dashboard/search')
}
