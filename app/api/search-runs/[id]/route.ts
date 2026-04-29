import { createClient } from '@/lib/supabase/server'

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
    decision: string
    rationale: string
    confidence: number
    model: string
  }> = {}

  if (resultIds.length > 0) {
    const { data: decisions } = await supabase
      .from('filter_decisions')
      .select('fsn_result_id, decision, rationale, confidence, model')
      .in('fsn_result_id', resultIds)

    for (const d of decisions ?? []) {
      decisionsMap[d.fsn_result_id] = {
        decision:   d.decision,
        rationale:  d.rationale,
        confidence: Number(d.confidence),
        model:      d.model,
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
