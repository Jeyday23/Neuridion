import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { z } from 'zod'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`report-dl:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const { searchParams } = new URL(request.url)
  const formatSchema = z.enum(['pdf', 'excel', 'docx', 'html']).default('pdf')
  let format: string
  try {
    format = formatSchema.parse(searchParams.get('format') ?? undefined)
  } catch {
    return Response.json({ error: 'Invalid format. Must be one of: pdf, excel, docx, html' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: run, error: runError } = await adminClient
    .from('search_runs')
    .select(`
      id, user_id, review_status,
      report_html_path, report_pdf_path, report_excel_path, report_docx_path,
      period_from, period_to,
      product_profiles ( device_name )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at' as never, null)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!run.review_status || run.review_status === 'draft') {
    return Response.json(
      { error: 'Results must be reviewed before downloading a report.' },
      { status: 422 },
    )
  }

  const profileRaw = run.product_profiles
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
    | { device_name: string }
    | null

  const deviceSlug = (profile?.device_name ?? 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const period = run.period_from && run.period_to
    ? `${run.period_from}_${run.period_to}`
    : 'report'

  let storagePath: string | null = null
  let ext = 'html'

  if (format === 'excel') {
    storagePath = run.report_excel_path
    ext = 'xlsx'
  } else if (format === 'docx') {
    storagePath = run.report_docx_path
    ext = 'docx'
  } else if (format === 'pdf') {
    storagePath = run.report_pdf_path ?? run.report_html_path
    ext = run.report_pdf_path ? 'pdf' : 'html'
  } else {
    storagePath = run.report_html_path
    ext = 'html'
  }

  if (!storagePath) {
    return Response.json({ error: 'Report not yet generated' }, { status: 404 })
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from('reports')
    .createSignedUrl(storagePath, 60)

  if (signError || !signed?.signedUrl) {
    return Response.json({ error: 'Failed to generate download link' }, { status: 500 })
  }

  const filename = `FSN-Report-${deviceSlug}-${period}.${ext}`

  await logAuditEvent(user.id, 'report_downloaded', { run_id: id, format }, request)

  return Response.json({ url: signed.signedUrl, filename })
}
