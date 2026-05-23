import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit, rateLimitWithIp, getClientIp } from '@/lib/rate-limit'
import { z } from 'zod'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const supabase = await createClient()
  const db       = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`search-run-get:${user.id}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('id, user_id, status, progress, error_message, relevant_count, uncertain_count, excluded_count, total_scraped, pre_filter_count')
    .eq('id', id)
    .is('deleted_at' as never, null)
    .single()

  if (runError || !run || run.user_id !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch FSN results — use admin client to bypass RLS on internal pipeline tables
  const { data: results, error: resultsError } = await db.from('fsn_results')
    .select('id, title, manufacturer, fsn_date, source_url, source_db')
    .eq('run_id', id)
    .order('fsn_date', { ascending: false })

  if (resultsError) {
    console.error('[search-runs/get]', resultsError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Fetch filter decisions — query by search_run_id directly (reliable single-step lookup)
  // Previously used .in('fsn_result_id', resultIds) which silently failed for large result sets
  const decisionsMap: Record<string, {
    decision:   string
    rationale:  string
    confidence: number | null
  }> = {}

  const { data: decisions, error: decisionsError } = await db.from('filter_decisions')
    .select('fsn_result_id, decision, rationale, confidence')
    .eq('search_run_id', id)

  for (const d of decisions ?? []) {
    decisionsMap[d.fsn_result_id] = {
      decision:   d.decision,
      rationale:  d.rationale,
      confidence: d.confidence != null ? Number(d.confidence) : null,
    }
  }

  // Shape results per spec
  const enriched = (results ?? []).map((r) => ({
    id:           r.id,
    title:        r.title,
    manufacturer: r.manufacturer,
    fsn_date:     r.fsn_date,
    source_url:   r.source_url,
    source:       r.source_db,
    filter_decision: decisionsMap[r.id] ?? null,
  }))

  return Response.json({
    status:           run.status,
    progress:         (run as { progress?: unknown }).progress ?? null,
    error_message:    (run as { error_message?: string }).error_message ?? null,
    relevant_count:   (run as { relevant_count?: number }).relevant_count  ?? 0,
    uncertain_count:  (run as { uncertain_count?: number }).uncertain_count ?? 0,
    excluded_count:   (run as { excluded_count?: number }).excluded_count  ?? 0,
    total_scraped:    (run as { total_scraped?: number }).total_scraped ?? null,
    pre_filter_count: (run as { pre_filter_count?: number }).pre_filter_count ?? null,
    results:          enriched,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const supabase = await createClient()
  const db = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = getClientIp(_request)
  const rl = await rateLimitWithIp(`search-run-delete:${user.id}`, 5, 60_000, ip)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const { data: run, error: runError } = await db
    .from('search_runs')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at' as never, null)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Soft-delete: mark as deleted, preserve data for EU MDR 10-year retention
  const { error: softDeleteError } = await db
    .from('search_runs')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id } as never)
    .eq('id', id)
    .eq('user_id', user.id)

  if (softDeleteError) {
    console.error('[search-runs/delete]', softDeleteError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'search_run_deleted', { run_id: id, soft_delete: true }, _request)

  return Response.json({ deleted: true })
}
