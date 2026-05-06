import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS, type PlanId } from '@/lib/plans'
import { runSearchPipeline, type SearchJobPayload } from '@/lib/pipeline/run-search'
import { z } from 'zod'

// Allow up to 30 minutes — long date ranges can take 15–20 min synchronously
export const maxDuration = 1800

const KNOWN_SOURCES  = ['bfarm', 'mhra', 'fda', 'swissmedic'] as const
const ISO_DATE       = /^\d{4}-\d{2}-\d{2}$/
const MAX_SPAN_YEARS = 5

const SearchRunBodySchema = z.object({
  profile_id:    z.string().uuid(),
  period_from:   z.string().regex(ISO_DATE, 'period_from must be YYYY-MM-DD'),
  period_to:     z.string().regex(ISO_DATE, 'period_to must be YYYY-MM-DD'),
  selected_dbs:  z.array(z.enum(KNOWN_SOURCES)).min(1).max(KNOWN_SOURCES.length).optional(),
  force_refresh: z.boolean().optional(),
}).superRefine((val, ctx) => {
  const from = new Date(val.period_from)
  const to   = new Date(val.period_to)
  if (isNaN(from.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_from is not a valid date', path: ['period_from'] }); return
  }
  if (isNaN(to.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_to is not a valid date', path: ['period_to'] }); return
  }
  if (from > to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'period_from must be on or before period_to', path: ['period_from'] })
  }
  const maxSpanMs = MAX_SPAN_YEARS * 365.25 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxSpanMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Date range may not exceed ${MAX_SPAN_YEARS} years`, path: ['period_to'] })
  }
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const db       = createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const bodyResult = SearchRunBodySchema.safeParse(rawBody)
  if (!bodyResult.success) {
    return Response.json({ error: bodyResult.error.issues.map((i) => i.message).join('; ') }, { status: 400 })
  }

  const { profile_id, period_from, period_to, selected_dbs, force_refresh } = bodyResult.data

  // Plan limit check
  const { data: userData } = await supabase.from('users').select('plan').eq('id', user.id).single()
  const userPlan = ((userData?.plan ?? 'free') as PlanId)
  const runLimit = PLANS[userPlan].maxSearchRuns
  if (runLimit !== -1) {
    const { count: runCount } = await supabase
      .from('search_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((runCount ?? 0) >= runLimit) {
      return Response.json(
        { error: `Your ${PLANS[userPlan].label} plan allows ${runLimit} search run${runLimit === 1 ? '' : 's'}. Upgrade to run more searches.` },
        { status: 403 },
      )
    }
  }

  // Profile ownership check
  const { data: profile, error: profileError } = await supabase
    .from('product_profiles')
    .select('id')
    .eq('id', profile_id)
    .eq('user_id', user.id)
    .single()
  if (profileError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Reject if user already has an active run — prevents concurrent pipeline abuse
  const { count: activeCount } = await db
    .from('search_runs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['pending', 'running'])

  if ((activeCount ?? 0) > 0) {
    return Response.json(
      { error: 'A search is already running. Please wait for it to complete before starting a new one.' },
      { status: 429 }
    )
  }

  // Create the search run
  const { data: run, error: runError } = await db
    .from('search_runs')
    .insert({
      profile_id,
      user_id:    user.id,
      status:     'running',
      period_from,
      period_to,
    })
    .select()
    .single()
  if (runError) {
    return Response.json({ error: runError.message }, { status: 500 })
  }

  const jobPayload: SearchJobPayload = {
    profile_id,
    period_from,
    period_to,
    selected_dbs:  selected_dbs ?? ['bfarm'],
    user_id:       user.id,
    force_refresh: force_refresh ?? false,
  }

  // Run the pipeline synchronously — updates search_runs.status on completion
  try {
    await runSearchPipeline(run.id, jobPayload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[search-runs] pipeline error for run', run.id, msg)
    await db.from('search_runs').update({
      status:       'error',
      error:        msg,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id)
    return Response.json({ error: 'Search pipeline failed: ' + msg }, { status: 500 })
  }

  // Read back the run row (pipeline sets status, counts, completed_at)
  const { data: finishedRun } = await db
    .from('search_runs')
    .select('status, relevant_count, uncertain_count, excluded_count, error')
    .eq('id', run.id)
    .single()

  // Fetch FSN results
  const { data: rawResults } = await db
    .from('fsn_results')
    .select('id, title, manufacturer, fsn_date, source_url, source_db')
    .eq('run_id', run.id)
    .order('fsn_date', { ascending: false })

  // Fetch filter decisions and join client-side
  const resultIds = (rawResults ?? []).map((r) => r.id)
  const decisionsMap: Record<string, {
    decision:   string
    rationale:  string
    confidence: number | null
    model:      string | null
  }> = {}

  if (resultIds.length > 0) {
    const { data: decisions } = await db
      .from('filter_decisions')
      .select('fsn_result_id, decision, rationale, confidence, model_used')
      .in('fsn_result_id', resultIds)

    for (const d of decisions ?? []) {
      decisionsMap[d.fsn_result_id] = {
        decision:   d.decision,
        rationale:  d.rationale ?? '',
        confidence: d.confidence != null ? Number(d.confidence) : null,
        model:      d.model_used ?? null,
      }
    }
  }

  const results = (rawResults ?? []).map((r) => ({
    id:              r.id,
    title:           r.title,
    manufacturer:    r.manufacturer,
    fsn_date:        r.fsn_date,
    source_url:      r.source_url,
    source:          r.source_db,
    filter_decision: decisionsMap[r.id] ?? null,
  }))

  return Response.json({
    run_id:  run.id,
    status:  finishedRun?.status ?? 'complete',
    results,
    counts: {
      relevant:  finishedRun?.relevant_count  ?? 0,
      uncertain: finishedRun?.uncertain_count ?? 0,
      excluded:  finishedRun?.excluded_count  ?? 0,
    },
  })
}
