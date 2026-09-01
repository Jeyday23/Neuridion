import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { isReportReleaseAuthorized } from '@/lib/reports/review-gate'
import { isRunAdjudicationComplete } from '@/lib/adjudication/readiness'
import { z } from 'zod'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`report-urls:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: report, error } = await supabase
    .from('reports')
    .select('run_id, pdf_storage_path, excel_storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !report) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('review_status, reviewed_by, reviewed_at')
    .eq('id', report.run_id)
    .eq('user_id', user.id)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  const adjudication = await isRunAdjudicationComplete(createAdminClient(), report.run_id)
  if (adjudication.error) {
    return Response.json({ error: adjudication.error }, { status: 503 })
  }
  if (!isReportReleaseAuthorized(run.review_status, run.reviewed_by, run.reviewed_at)
    || !adjudication.ready) {
    return Response.json(
      { error: 'This search must be reviewed and approved before downloading a report.' },
      { status: 422 },
    )
  }

  const [pdfSigned, excelSigned] = await Promise.all([
    report.pdf_storage_path
      ? supabase.storage.from('reports').createSignedUrl(report.pdf_storage_path, 60)
      : Promise.resolve({ data: null }),
    report.excel_storage_path
      ? supabase.storage.from('reports').createSignedUrl(report.excel_storage_path, 60)
      : Promise.resolve({ data: null }),
  ])

  return Response.json({
    pdf_url:   pdfSigned.data?.signedUrl ?? null,
    excel_url: excelSigned.data?.signedUrl ?? null,
  })
}
