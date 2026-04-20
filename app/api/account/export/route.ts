import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
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

  const [fsnResultsRes, filterDecisionsRes, pdfUsageRes] = await Promise.all([
    runIds.length > 0
      ? admin.from('fsn_results').select('*').in('run_id', runIds)
      : Promise.resolve({ data: [] }),
    runIds.length > 0
      ? admin.from('filter_decisions').select('*').in('search_run_id', runIds)
      : Promise.resolve({ data: [] }),
    admin.from('pdf_usage').select('*').eq('user_id', user.id),
  ])

  const exportPayload = {
    exported_at:     new Date().toISOString(),
    user_id:         user.id,
    user_email:      user.email,
    profile:         profileRes.data ?? null,
    device_profiles: deviceProfilesRes.data ?? [],
    search_runs:     searchRunsRes.data ?? [],
    fsn_results:     fsnResultsRes.data ?? [],
    filter_decisions: filterDecisionsRes.data ?? [],
    pdf_usage:       pdfUsageRes.error ? [] : (pdfUsageRes.data ?? []),
    audit_log:       auditLogRes.data ?? [],
  }

  await logAuditEvent(user.id, 'data_exported', { run_count: runIds.length }, request)

  const date     = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `kodex-data-export-${date}.json`

  return new Response(JSON.stringify(exportPayload, null, 2), {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
