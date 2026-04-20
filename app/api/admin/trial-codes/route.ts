import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function generateCode(): string {
  const bytes = randomBytes(10)
  let part = ''
  for (let i = 0; i < 8; i++) {
    part += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return `KDX-${part}`
}

export async function POST(request: Request) {
  const adminUser = await checkIsAdmin()
  if (!adminUser) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { batch_name?: string; quantity?: number; expires_at?: string } = {}
  try { body = await request.json() } catch { /* empty */ }

  const { batch_name = 'Unnamed', quantity = 10, expires_at } = body

  if (quantity < 1 || quantity > 100) {
    return Response.json({ error: 'Quantity must be 1–100' }, { status: 400 })
  }

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
  if (error) return Response.json({ error: error.message }, { status: 500 })

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

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ codes: data ?? [] })
}
