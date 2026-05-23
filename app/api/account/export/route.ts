import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

/** Batch `.in()` queries into chunks to avoid PostgREST URL length limits. */
async function batchIn<T>(
  db: ReturnType<typeof createAdminClient>,
  table: string,
  selectCols: string,
  column: string,
  ids: string[],
  limit = 10000
): Promise<T[]> {
  const CHUNK = 200
  const all: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table name is always a known literal at each call site
    const { data } = await (db.from as any)(table).select(selectCols).in(column, chunk).limit(limit)
    if (data) all.push(...(data as T[]))
  }
  return all
}

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
    admin.from('product_profiles').select('id, device_name, manufacturer, intended_use, emdn_code, device_class, created_at').eq('user_id', user.id).limit(10000),  // search_strategy excluded: system-generated algorithm config, not user personal data
    admin.from('search_runs').select('id, profile_id, status, period_from, period_to, started_at, completed_at, relevant_count, uncertain_count, excluded_count, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10000),
    admin.from('audit_log').select('id, user_id, event_type, event_data, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  const runIds = (searchRunsRes.data ?? []).map((r) => r.id)

  const profileIds = (deviceProfilesRes.data ?? []).map((p) => p.id)

  // login_attempts stores a SHA-256 hash of the email, not the raw address
  const emailHash = createHash('sha256').update(user.email.toLowerCase()).digest('hex').slice(0, 32)

  const [
    fsnResults,
    filterDecisions,
    profileEditHistory,
    pdfUsageRes,
    searchDraftsRes,
    userFeedbackRes,
    reportsRes,
    loginAttemptsRes,
  ] = await Promise.all([
    runIds.length > 0
      ? batchIn<Record<string, unknown>>(admin, 'fsn_results', 'id, run_id, external_id, title, manufacturer, fsn_date, source_url, source_db, created_at', 'run_id', runIds)
      : Promise.resolve([]),
    runIds.length > 0
      ? batchIn<Record<string, unknown>>(admin, 'filter_decisions', 'id, fsn_result_id, search_run_id, decision, rationale, confidence, model, created_at', 'search_run_id', runIds)
      : Promise.resolve([]),
    profileIds.length > 0
      ? batchIn<Record<string, unknown>>(admin, 'profile_edit_history', 'id, profile_id, edited_by, edited_at, changed_fields, previous_values', 'profile_id', profileIds)
      : Promise.resolve([]),
    admin.from('pdf_usage').select('id, user_id, month, count').eq('user_id', user.id),
    admin.from('search_drafts').select('id, user_id, profile_id, name, search_period_from, search_period_to, dbs_selected, created_at').eq('user_id', user.id).limit(10000),  // generic_terms + manufacturer_terms excluded: system-generated search intelligence, not user personal data
    admin.from('user_feedback').select('id, user_id, rating, most_useful, missing_features, triggered_by, created_at').eq('user_id', user.id),
    admin.from('reports').select('id, run_id, user_id, generated_at').eq('user_id', user.id),
    admin.from('login_attempts').select('id, success, attempted_at').eq('email', emailHash).limit(1000),
  ])

  const exportPayload = {
    exported_at:          new Date().toISOString(),
    user_id:              user.id,
    user_email:           user.email,
    account:              profileRes.data ?? null,
    device_profiles:      deviceProfilesRes.data ?? [],
    search_history:       searchRunsRes.data ?? [],
    safety_notices:       fsnResults,
    ai_classifications:   filterDecisions,
    pdf_quota:            pdfUsageRes.error ? [] : (pdfUsageRes.data ?? []),
    activity_log:         auditLogRes.data ?? [],
    saved_drafts:         searchDraftsRes.data ?? [],
    feedback:             userFeedbackRes.data ?? [],
    profile_changes:      profileEditHistory,
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
