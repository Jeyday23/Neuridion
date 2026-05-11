import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = rateLimit(`export:${user.id}`, 3, 300_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many export requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  if (!user.email) {
    return Response.json({ error: 'Email address required for data export' }, { status: 400 })
  }

  const admin = createAdminClient()

  const [
    profileRes,
    deviceProfilesRes,
    searchRunsRes,
    auditLogRes,
  ] = await Promise.all([
    admin.from('users').select('*').eq('id', user.id).single(),
    admin.from('product_profiles').select('*').eq('user_id', user.id),
    admin.from('search_runs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    admin.from('audit_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  const runIds = (searchRunsRes.data ?? []).map((r) => r.id)

  const profileIds = (deviceProfilesRes.data ?? []).map((p) => p.id)

  const [
    fsnResultsRes,
    filterDecisionsRes,
    pdfUsageRes,
    searchDraftsRes,
    userFeedbackRes,
    profileEditHistoryRes,
    reportsRes,
    loginAttemptsRes,
  ] = await Promise.all([
    runIds.length > 0
      ? admin.from('fsn_results').select('*').in('run_id', runIds).limit(10000)
      : Promise.resolve({ data: [] }),
    runIds.length > 0
      ? admin.from('filter_decisions').select('*').in('search_run_id', runIds).limit(10000)
      : Promise.resolve({ data: [] }),
    admin.from('pdf_usage').select('*').eq('user_id', user.id),
    admin.from('search_drafts').select('*').eq('user_id', user.id),
    admin.from('user_feedback').select('*').eq('user_id', user.id),
    profileIds.length > 0
      ? admin.from('profile_edit_history').select('*').in('profile_id', profileIds)
      : Promise.resolve({ data: [] }),
    admin.from('reports').select('*').eq('user_id', user.id),
    admin.from('login_attempts').select('*').eq('email', user.email).limit(1000),
  ])

  const exportPayload = {
    exported_at:          new Date().toISOString(),
    user_id:              user.id,
    user_email:           user.email,
    profile:              profileRes.data ?? null,
    device_profiles:      deviceProfilesRes.data ?? [],
    search_runs:          searchRunsRes.data ?? [],
    fsn_results:          fsnResultsRes.data ?? [],
    filter_decisions:     filterDecisionsRes.data ?? [],
    pdf_usage:            pdfUsageRes.error ? [] : (pdfUsageRes.data ?? []),
    audit_log:            auditLogRes.data ?? [],
    search_drafts:        searchDraftsRes.data ?? [],
    user_feedback:        userFeedbackRes.data ?? [],
    profile_edit_history: profileEditHistoryRes.data ?? [],
    reports:              reportsRes.data ?? [],
    login_attempts:       loginAttemptsRes.data ?? [],
  }

  await logAuditEvent(user.id, 'data_exported', { run_count: runIds.length }, request)

  const date     = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `neuridion-data-export-${date}.json`

  return new Response(JSON.stringify(exportPayload, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
