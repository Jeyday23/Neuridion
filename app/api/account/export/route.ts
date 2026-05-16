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

  const rl = await rateLimit(`export:${user.id}`, 3, 300_000)
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
    admin.from('users').select('id, email, full_name, company_name, plan, role, subscription_status, current_period_end, consent_cookies_at, consent_terms_at, consent_privacy_at, deletion_requested_at, created_at').eq('id', user.id).single(),
    admin.from('product_profiles').select('id, device_name, manufacturer, intended_use, emdn_code, device_class, created_at').eq('user_id', user.id),  // search_strategy excluded: system-generated algorithm config, not user personal data
    admin.from('search_runs').select('id, profile_id, status, period_from, period_to, started_at, completed_at, relevant_count, uncertain_count, excluded_count, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    admin.from('audit_log').select('id, user_id, event_type, event_data, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
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
      ? admin.from('fsn_results').select('id, run_id, external_id, title, manufacturer, fsn_date, source_url, source_db, created_at').in('run_id', runIds).limit(10000)
      : Promise.resolve({ data: [] }),
    runIds.length > 0
      ? admin.from('filter_decisions').select('id, fsn_result_id, search_run_id, decision, rationale, created_at').in('search_run_id', runIds).limit(10000)  // model + confidence excluded: system-generated internals, not user personal data
      : Promise.resolve({ data: [] }),
    admin.from('pdf_usage').select('id, user_id, month, count').eq('user_id', user.id),
    admin.from('search_drafts').select('id, user_id, profile_id, name, search_period_from, search_period_to, dbs_selected, created_at').eq('user_id', user.id),  // generic_terms + manufacturer_terms excluded: system-generated search intelligence, not user personal data
    admin.from('user_feedback').select('id, user_id, rating, most_useful, missing_features, triggered_by, created_at').eq('user_id', user.id),
    profileIds.length > 0
      ? admin.from('profile_edit_history').select('id, profile_id, edited_by, edited_at, changed_fields, previous_values').in('profile_id', profileIds)
      : Promise.resolve({ data: [] }),
    admin.from('reports').select('id, run_id, user_id, generated_at').eq('user_id', user.id),
    admin.from('login_attempts').select('id, success, attempted_at').eq('email', user.email).limit(1000),
  ])

  const exportPayload = {
    exported_at:          new Date().toISOString(),
    user_id:              user.id,
    user_email:           user.email,
    account:              profileRes.data ?? null,
    device_profiles:      deviceProfilesRes.data ?? [],
    search_history:       searchRunsRes.data ?? [],
    safety_notices:       fsnResultsRes.data ?? [],
    ai_classifications:   filterDecisionsRes.data ?? [],
    pdf_quota:            pdfUsageRes.error ? [] : (pdfUsageRes.data ?? []),
    activity_log:         auditLogRes.data ?? [],
    saved_drafts:         searchDraftsRes.data ?? [],
    feedback:             userFeedbackRes.data ?? [],
    profile_changes:      profileEditHistoryRes.data ?? [],
    reports:              reportsRes.data ?? [],
    login_history:        loginAttemptsRes.data ?? [],
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
