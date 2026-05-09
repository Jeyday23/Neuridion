import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SettingsClient } from './settings-client'

export const metadata = { title: 'Settings — Neuridion' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('deletion_requested_at, deleted_at, consent_terms_at, consent_privacy_at, consent_cookies_at')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-[#0F1F3D] mb-8">Account Settings</h1>

      {userData?.deletion_requested_at && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-5 py-4">
          <p className="text-sm font-semibold text-red-800">
            Your account is scheduled for deletion on{' '}
            {new Date(userData.deleted_at!).toLocaleDateString('en-GB')}.
          </p>
          <p className="text-xs text-red-700 mt-1">
            Log in before that date and cancel below to keep your account.
          </p>
        </div>
      )}

      <SettingsClient
        initialEmail={user.email ?? ''}
        initialFullName={(user.user_metadata?.full_name as string) ?? ''}
        initialCompanyName={(user.user_metadata?.company_name as string) ?? ''}
        deletionPending={!!userData?.deletion_requested_at}
        deletionDate={userData?.deleted_at ?? null}
        consentTermsAt={userData?.consent_terms_at ?? null}
        consentPrivacyAt={userData?.consent_privacy_at ?? null}
        consentCookiesAt={userData?.consent_cookies_at ?? null}
      />
    </div>
  )
}
