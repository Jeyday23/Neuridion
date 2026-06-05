import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { generateReportPdf, canGeneratePdf, incrementPdfUsage } from '@/lib/pdfshift'
import { buildDocx } from '@/lib/docx-report'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { buildReportHtml } from '@/lib/reports/html-builder'
import { buildExcel } from '@/lib/reports/excel-builder'
import type { FsnReportRow } from '@/lib/domain/types'

export const maxDuration = 120

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`reports:${ip}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // GDPR Art 18: block data-processing operations when restricted
  const { data: userFlags, error: userFlagsError } = await supabase.from('users').select('processing_restricted, plan').eq('id', user.id).single()
  if (userFlagsError) console.error('[reports]', 'query error:', userFlagsError.code)
  if (userFlags?.processing_restricted) {
    return Response.json({ error: 'Data processing is currently restricted on your account. You can change this in Settings > Privacy.' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = z.object({ run_id: z.uuid() }).safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'run_id must be a valid UUID' }, { status: 422 })
  }
  const { run_id } = parsed.data

  // Fetch run + profile (validates ownership)
  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('id, status, review_status, reviewed_by, reviewed_at, period_from, period_to, dbs_searched, terms_used, profile_snapshot, product_profiles(device_name, manufacturer, device_class, emdn_code, intended_use)')
    .eq('id', run_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!run.review_status || run.review_status === 'draft') {
    return Response.json(
      { error: 'Results must be reviewed before generating a report. Open the run and mark your review as complete.' },
      { status: 422 },
    )
  }

  const snapshot = (run as { profile_snapshot?: { device_name: string; manufacturer: string; device_class?: string | null; emdn_code?: string | null } | null }).profile_snapshot
  const profileRaw = run.product_profiles
  const liveProfile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null
  } | null
  const profile = snapshot
    ? { device_name: snapshot.device_name, manufacturer: snapshot.manufacturer, device_class: snapshot.device_class ?? null, emdn_code: snapshot.emdn_code ?? null }
    : liveProfile

  if (!profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Fetch FSN results — use admin client; pipeline tables may lack user-read RLS policies
  const db = createAdminClient()
  const { data: rawResults, error: resultsError } = await db
    .from('fsn_results')
    .select('id, title, manufacturer, fsn_date, source_url, source_db')
    .eq('run_id', run_id)
    .order('fsn_date', { ascending: false })

  if (resultsError) {
    console.error('[reports]', resultsError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Fetch filter decisions — use admin client (same reason as above)
  const decisionsMap: Record<string, { decision: string; rationale: string; confidence: number }> = {}

  const { data: decisions } = await db
    .from('filter_decisions')
    // 'model' exists in DB but not in generated Supabase types — cast preserves type inference for other columns
    .select('fsn_result_id, decision, rationale, confidence, model' as 'fsn_result_id, decision, rationale, confidence')
    .eq('search_run_id', run_id)

  for (const d of decisions ?? []) {
    decisionsMap[d.fsn_result_id] = {
      decision:   d.decision,
      rationale:  d.rationale,
      confidence: Number(d.confidence),
    }
  }

  // 'model' column exists in DB but not in generated Supabase types — cast to extract
  const aiModels = [...new Set((decisions ?? []).map(d => (d as { model?: string }).model).filter((m): m is string => !!m))]

  // Resolve reviewer name
  let reviewerName: string | null = null
  const reviewedBy = (run as { reviewed_by?: string | null }).reviewed_by
  const reviewedAt = (run as { reviewed_at?: string | null }).reviewed_at
  if (reviewedBy) {
    const { data: reviewer } = await supabase.from('users').select('full_name, email').eq('id', reviewedBy).single()
    reviewerName = reviewer?.full_name || reviewer?.email || null
  }

  const rows: FsnReportRow[] = (rawResults ?? []).map((r) => ({
    id:              r.id,
    title:           r.title,
    manufacturer:    r.manufacturer ?? '',
    fsn_date:        r.fsn_date,
    source_url:      r.source_url ?? '',
    source_db:       r.source_db,
    filter_decision: (decisionsMap[r.id] as FsnReportRow['filter_decision']) ?? null,
  }))

  // ── Generate and upload each format sequentially to cap peak memory ────────
  const termsUsed = (run as { terms_used?: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null }).terms_used ?? null
  const adminStorage = createAdminClient()
  const ts = Date.now()
  const userPlan = userFlags?.plan ?? 'free'
  const paidPlans = ['starter', 'pro', 'enterprise']

  // HTML — smallest, generate first
  const runStatus = (run as { status?: string }).status
  const dbsSearched = (run as { dbs_searched?: string[] | null }).dbs_searched
  const htmlPath = `${user.id}/${run_id}/${ts}_report.html`
  {
    const html = buildReportHtml(
      profile,
      { period_from: run.period_from, period_to: run.period_to, status: runStatus, dbs_searched: Array.isArray(dbsSearched) ? dbsSearched : null },
      rows, run_id, termsUsed,
      { aiModels, reviewerName, reviewedAt },
    )
    const { error } = await adminStorage.storage.from('reports').upload(htmlPath, Buffer.from(html, 'utf-8'), { contentType: 'text/html', upsert: true })
    if (error) {
      console.error('[reports] upload error', error.message)
      return Response.json({ error: 'Failed to upload report' }, { status: 500 })
    }
  }

  // Excel
  const excelPath = `${user.id}/${run_id}/${ts}_report.xlsx`
  {
    const excelBuf = await buildExcel(rows, {
      device: profile.device_name, manufacturer: profile.manufacturer,
      period_from: run.period_from, period_to: run.period_to,
    }, termsUsed)
    const { error } = await adminStorage.storage.from('reports').upload(excelPath, excelBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    })
    if (error) {
      console.error('[reports] upload error', error.message)
      return Response.json({ error: 'Failed to upload report' }, { status: 500 })
    }
  }

  // Word (.docx) — Starter+ only
  let docxPath: string | null = null
  if (paidPlans.includes(userPlan)) {
    docxPath = `${user.id}/${run_id}/${ts}_report.docx`
    const docxBuf = await buildDocx(rows, {
      device: profile.device_name, manufacturer: profile.manufacturer,
      period_from: run.period_from, period_to: run.period_to,
      emdn_code: profile.emdn_code, device_class: profile.device_class,
      runId: run_id,
    })
    const { error } = await adminStorage.storage.from('reports').upload(docxPath, docxBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true,
    })
    if (error) {
      console.error('[reports] upload error', error.message)
      return Response.json({ error: 'Failed to upload report' }, { status: 500 })
    }
  }

  // ── Create signed URLs ──────────────────────────────────────────────────────
  // Signed URLs bypass application-layer audit logging — keep TTL short
  const [htmlSigned, excelSigned] = await Promise.all([
    adminStorage.storage.from('reports').createSignedUrl(htmlPath, 60),
    adminStorage.storage.from('reports').createSignedUrl(excelPath, 60),
  ])

  const docxSigned = docxPath
    ? await adminStorage.storage.from('reports').createSignedUrl(docxPath, 60)
    : null

  // ── Generate PDF via @react-pdf/renderer (quota-guarded) ────────────────────
  let pdfUrl: string | null = null
  let pdfStatus: 'generated' | 'quota_exceeded' | 'failed' = 'failed'
  let pdfPath: string | null = null

  const quotaCheck = await canGeneratePdf(adminStorage, user.id)

  if (quotaCheck.allowed) {
    try {
      const pdfBuffer = await generateReportPdf({
        profile,
        run: { period_from: run.period_from, period_to: run.period_to },
        rows,
        runId: run_id,
      })

      pdfPath = `${user.id}/${run_id}/${ts}_report.pdf`
      const { error: pdfUploadErr } = await adminStorage.storage
        .from('reports')
        .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

      if (!pdfUploadErr) {
        // Signed URLs bypass application-layer audit logging — keep TTL short
        const { data: pdfSigned } = await adminStorage.storage
          .from('reports')
          .createSignedUrl(pdfPath, 60)

        pdfUrl = pdfSigned?.signedUrl ?? null
        pdfStatus = 'generated'
        await incrementPdfUsage(adminStorage, user.id)
      } else {
        console.error('[PDF] Upload failed:', pdfUploadErr.message)
      }
    } catch (err) {
      console.error('[PDF] Generation failed:', err instanceof Error ? err.message : String(err))
      pdfStatus = 'failed'
    }
  } else {
    pdfStatus = 'quota_exceeded'
    console.error('[PDF] Quota exceeded for user')
  }

  // Ownership verified via session-scoped query above — admin client needed for report_* columns not in RLS
  await adminStorage
    .from('search_runs')
    .update({
      report_html_path:     htmlPath,
      report_pdf_path:      pdfPath,
      report_excel_path:    excelPath,
      report_docx_path:     docxPath,
      report_generated_at:  new Date().toISOString(),
    })
    .eq('id', run_id)

  await logAuditEvent(user.id, 'report_generated', { run_id, pdf_status: pdfStatus }, request)

  return Response.json({
    html_url:   htmlSigned.data?.signedUrl ?? null,
    excel_url:  excelSigned.data?.signedUrl ?? null,
    docx_url:   docxSigned?.data?.signedUrl ?? null,
    pdf_url:    pdfUrl,
    pdf_status: pdfStatus,
  }, { status: 201 })
}
