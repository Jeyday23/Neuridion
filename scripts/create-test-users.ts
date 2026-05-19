import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const pw = process.env.TEST_USER_PASSWORD
  if (!pw) throw new Error('TEST_USER_PASSWORD env var is required')

  const users = [
    { email: 'anna.weber.prrc@testmail.dev', password: pw, full_name: 'Dr. Anna Weber', company_name: 'MedSafe Devices GmbH' },
    { email: 'max.engineer@testmail.dev', password: pw, full_name: 'Max Müller', company_name: 'MedSafe Devices GmbH' },
  ]

  for (const u of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, company_name: u.company_name },
    })
    if (error) {
      if (error.message.includes('already been registered')) {
        console.log(`[OK] ${u.email} already exists`)
      } else {
        console.error(`[ERR] ${u.email}: ${error.message}`)
      }
    } else {
      console.log(`[OK] Created ${u.email} (id: ${data.user.id})`)
      const { error: insertErr } = await supabase.from('users').upsert({
        id: data.user.id,
        email: u.email,
        full_name: u.full_name,
        company_name: u.company_name,
        plan: 'trial',
        role: 'user',
        subscription_status: 'trialing',
      }, { onConflict: 'id' })
      if (insertErr) console.error(`[WARN] users insert: ${insertErr.message}`)
      else console.log(`[OK] ${u.email} added to users table (plan=trial)`)
    }
  }
}

main().catch(console.error)
