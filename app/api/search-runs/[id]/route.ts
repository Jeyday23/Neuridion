import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

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

  // Fetch FSN results for this run
  const { data: results, error: resultsError } = await supabase
    .from('fsn_results')
    .select('*')
    .eq('run_id', id)
    .order('fsn_date', { ascending: false })

  if (resultsError) {
    return Response.json({ error: resultsError.message }, { status: 500 })
  }

  // Fetch filter decisions for these results
  const resultIds = (results ?? []).map((r) => r.id)
  const decisionsMap: Record<string, {
    decision:   string
    rationale:  string
    confidence: number | null
    model:      string | null
  }> = {}

  if (resultIds.length > 0) {
    const { data: decisions } = await supabase
      .from('filter_decisions')
      .select('fsn_result_id, decision, rationale, confidence, model_used')
      .in('fsn_result_id', resultIds)

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

  return Response.json({ run, results: enriched })
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
