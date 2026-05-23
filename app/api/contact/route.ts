import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { sendContactMessage } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'

const ContactSchema = z.object({
  name:    z.string().min(1).max(200),
  email:   z.string().email().max(320),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
  _hp_field: z.string().max(0).optional(),
  _t:      z.number(),
})

const MIN_SUBMIT_MS = 2000

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req)
  const rl = await rateLimit(`contact:${ip}`, 3, 3_600_000)
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Please fill in all required fields.' }, { status: 400 })
  }

  const { name, email, subject, message, _hp_field, _t } = parsed.data

  if (_hp_field) {
    return Response.json({ ok: true })
  }

  if (Date.now() - _t < MIN_SUBMIT_MS) {
    return Response.json({ ok: true })
  }

  try {
    await sendContactMessage({ name, email, subject, message })
  } catch (err) {
    console.error('[contact]', err instanceof Error ? err.message : String(err))
    return Response.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }

  await logAuditEvent(null, 'contact_form_submitted', {
    subject,
  }, req)

  return Response.json({ ok: true }, { status: 201 })
}
