import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { checkLoginRateLimit, recordLoginAttempt, getClientIp } from '@/lib/rate-limit'
import { checkFailedLoginAlert } from '@/lib/security-alerts'
import { z } from 'zod'

const PostLoginSchema = z.object({
  email: z.string().email(),
  success: z.boolean(),
  method: z.enum(['password', 'otp']).optional(),
  checkOnly: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  const body = await req.json().catch(() => null)
  const parsed = PostLoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { email, success, method, checkOnly } = parsed.data

  if (!success) {
    if (!checkOnly) {
      await recordLoginAttempt(ip, email, false)
      checkFailedLoginAlert(ip).catch(() => {})
    }

    // Check if now rate-limited
    const rateCheck = await checkLoginRateLimit(ip)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { blocked: true, error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 },
      )
    }

    return NextResponse.json({ blocked: false })
  }

  // Success case: verify the user is actually authenticated via cookies
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Authentication could not be verified.' },
      { status: 401 },
    )
  }

  // Log the successful login
  await logAuditEvent(user.id, 'login', { email, method: method ?? 'password' }, req)

  // Determine redirect based on admin role
  const adminClient = createAdminClient()
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const redirect = userRow?.role === 'admin' ? '/admin' : '/dashboard/search'

  return NextResponse.json({ redirect })
}
