import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'
import { z } from 'zod'

const CreateTrialCodesSchema = z.object({
  batch_name: z.string().min(1).max(100).default('Unnamed'),
  quantity:   z.number().int().min(1).max(500).default(10),
  expires_at: z.iso.date().optional(),
})

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function generateCode(): string {
  const bytes = randomBytes(14)
  let part = ''
  for (let i = 0; i < 12; i++) {
    part += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return `KDX-${part}`
}

export async function POST(request: Request) {
  const adminUser = await checkIsAdmin()
  if (!adminUser) return Response.json({ error: 'Forbidden' }, { status: 403 })

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

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trial_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[trial-codes:GET]', error.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
  return Response.json({ codes: data ?? [] })
}
