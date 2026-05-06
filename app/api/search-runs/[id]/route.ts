import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const db       = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('*')
    .eq('id', id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (run.user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── DIAGNOSTIC LOGGING ───────────────────────────────────────────────────────
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log(`[diag] client type: ${hasServiceKey ? 'admin (service role)' : 'MISSING SERVICE KEY — falling back to anon'}`)
  console.log(`[diag] fsn_results query: run_id=${id}`)

  // Fetch FSN results — use admin client to bypass RLS on internal pipeline tables
  const { data: results, error: resultsError } = await db.from('fsn_results')
    .select('*')
    .eq('run_id', id)
    .order('fsn_date', { ascending: false })

  console.log(`[diag] fsn_results result count: ${results?.length ?? 0}`)
  if (resultsError) {
    console.error(`[diag] fsn_results error: ${resultsError.message}`)
    return Response.json({ error: resultsError.message }, { status: 500 })
  }
  if (results && results.length > 0) {
    console.log(`[diag] fsn_results first row id: ${results[0].id} run_id: ${results[0].run_id ?? '(no run_id col)'} search_run_id: ${results[0].search_run_id ?? '(none)'}`)
  }

  // Fetch filter decisions for these results
  const resultIds = (results ?? []).map((r) => r.id)
  const decisionsMap: Record<string, {
    decision:   string
    rationale:  string
    confidence: number | null
    model:      string | null
  }> = {}

  console.log(`[diag] filter_decisions query: run_id=${id} fsn_result_ids count=${resultIds.length}`)

  if (resultIds.length > 0) {
    const { data: decisions, error: decisionsError } = await db.from('filter_decisions')
      .select('fsn_result_id, decision, rationale, confidence, model_used')
      .in('fsn_result_id', resultIds)

    console.log(`[diag] filter_decisions result count: ${decisions?.length ?? 0}`)
    if (decisionsError) {
      console.error(`[diag] filter_decisions error: ${decisionsError.message}`)
    }
    if (decisions && decisions.length > 0) {
      console.log(`[diag] filter_decisions first row: ${JSON.stringify(decisions[0])}`)
    } else {
      // No decisions found — also try querying by search_run_id to reveal if data exists under a different FK
      const { data: byRunId, error: byRunIdError } = await db.from('filter_decisions')
        .select('id, fsn_result_id, decision, search_run_id')
        .eq('search_run_id', id)
        .limit(3)
      console.log(`[diag] filter_decisions by search_run_id count: ${byRunId?.length ?? 0} error: ${byRunIdError?.message ?? 'none'}`)
      if (byRunId && byRunId.length > 0) {
        console.log(`[diag] filter_decisions by search_run_id first row: ${JSON.stringify(byRunId[0])}`)
      }
    }

    for (const d of decisions ?? []) {
      decisionsMap[d.fsn_result_id] = {
        decision:   d.decision,
        rationale:  d.rationale,
        confidence: d.confidence != null ? Number(d.confidence) : null,
        model:      d.model_used ?? null,
      }
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
    status:          run.status,
    progress:        (run as { progress?: unknown }).progress ?? null,
    error_message:   (run as { error_message?: string }).error_message ?? null,
    relevant_count:  (run as { relevant_count?: number }).relevant_count  ?? 0,
    uncertain_count: (run as { uncertain_count?: number }).uncertain_count ?? 0,
    excluded_count:  (run as { excluded_count?: number }).excluded_count  ?? 0,
    results:         enriched,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const db = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: run, error: runError } = await db
    .from('search_runs')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // NULL out the legacy search_run_id FK (NO ACTION constraint) before deleting
  const { error: unlinkError } = await db
    .from('fsn_results')
    .update({ search_run_id: null })
    .eq('search_run_id', id)

  if (unlinkError) {
    return Response.json({ error: unlinkError.message }, { status: 500 })
  }

  const { data: deleted, error: deleteError } = await db
    .from('search_runs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .single()

  if (deleteError || !deleted) {
    return Response.json({ error: deleteError?.message ?? 'Unable to delete search run' }, { status: 500 })
  }

  return Response.json({ deleted: true })
}
