'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SignupState = { error: string } | null

export async function signup(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const fullName = (formData.get('full_name') as string)?.trim()
  const companyName = (formData.get('company_name') as string)?.trim()

  if (!email || !password || !fullName || !companyName) {
    return { error: 'All fields are required.' }
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  const supabase = await createClient()

  await supabase.auth.signOut()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        company_name: companyName,
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  // session is null when Supabase requires email confirmation
  if (!data.session) {
    redirect('/signup/confirm')
  }

  redirect('/dashboard/search')
}
