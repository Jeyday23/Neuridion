import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

const CreateTrialCodesSchema = z.object({
  batch_name: z.string().min(1).max(100).default('Unnamed'),
  quantity:   z.number().int().min(1).max(500).default(10),
  expires_at: z.iso.date().optional(),
})

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function generateCode(): string {
  const segLen = 12
  // Rejection sampling to eliminate modulo bias.
  // ALPHABET.length = 31 → maxValid = 256 - (256 % 31) = 248.
  // Each byte has a ~3.1% chance of rejection, so 20 bytes gives ample headroom for 12 chars.
  const maxValid = 256 - (256 % ALPHABET.length)
  const bytes = randomBytes(20)
  let part = ''
  for (let i = 0; i < bytes.length && part.length < segLen; i++) {
    if (bytes[i] >= maxValid) continue
    part += ALPHABET[bytes[i] % ALPHABET.length]
  }
  // Extremely unlikely fallback: if we still don't have enough chars, generate more bytes
  while (part.length < segLen) {
    const extra = randomBytes(8)
    for (let i = 0; i < extra.length && part.length < segLen; i++) {
      if (extra[i] >= maxValid) continue
      part += ALPHABET[extra[i] % ALPHABET.length]
    }
  }
  return `KDX-${part}`
}

export async function POST(request: Request) {
  const adminUser = await checkIsAdmin()
  if (!adminUser) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const rl = await rateLimit(`trial-codes:${adminUser.id}`, 10, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateTrialCodesSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 })
  }
  const { batch_name, quantity, expires_at } = parsed.data

  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const rows = Array.from({ length: quantity }, () => ({
    code:       generateCode(),
    batch_name,
    created_by: user?.id ?? null,
    expires_at: expires_at ?? null,
  }))

  const { data, error } = await admin.from('trial_codes').insert(rows).select('id')
  if (error) {
    console.error('[trial-codes:POST]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return Response.json({ ok: true, created: data?.length ?? 0 }, { status: 201 })
}

export async function GET() {
  const adminUser = await checkIsAdmin()
  if (!adminUser) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const rl = await rateLimit(`trial-codes:${adminUser.id}`, 10, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trial_codes')
    .select('id, code, batch_name, redeemed_by_email, redeemed_at, created_at, expires_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[trial-codes:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
  return Response.json({ codes: data ?? [] })
}
