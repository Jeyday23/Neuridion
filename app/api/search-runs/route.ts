import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS, type PlanId } from '@/lib/plans'
import { type SearchJobPayload } from '@/lib/pipeline/run-search'
import { type QStashJobMessage } from '@/app/api/worker/process-job/route'
import { Client } from '@upstash/qstash'
import { z } from 'zod'

// POST enqueues to QStash and returns in <200ms — pipeline runs in process-job worker
export const maxDuration = 30

const KNOWN_SOURCES  = ['bfarm', 'mhra', 'fda', 'swissmedic'] as const
const ISO_DATE       = /^\d{4}-\d{2}-\d{2}$/
const MAX_SPAN_YEARS = 5

const SearchRunBodySchema = z.object({
  profile_id:    z.uuid(),
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
      { status: 429 },
    )
  }

  // Create the search run in pending state — process-job transitions it to running on start
  const { data: run, error: runError } = await db
    .from('search_runs')
    .insert({
      profile_id,
      user_id:    user.id,
      status:     'pending',
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

  // Insert job queue row for status tracking and payload recovery on retry
  const { data: newJob, error: queueError } = await db
    .from('search_job_queue')
    .insert({ run_id: run.id, payload: jobPayload as unknown as import('@/types/supabase').Json })
    .select('id')
    .single()

  if (queueError || !newJob) {
    await db.from('search_runs').delete().eq('id', run.id)
    return Response.json({ error: 'Failed to create job record' }, { status: 500 })
  }

  // Publish to QStash — pipeline runs async in /api/worker/process-job
  const message: QStashJobMessage = {
    run_id: run.id,
    job_id: newJob.id,
    ...jobPayload,
  }

  try {
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! })
    await qstash.publishJSON({
      url:     `${process.env.NEXT_PUBLIC_SITE_URL}/api/worker/process-job`,
      body:    message,
      retries: 0,
      timeout: 900,
    })
  } catch (err) {
    console.error(`[search-runs] QStash publish failed for run_id=${run.id}:`, err)
    await db.from('search_job_queue').delete().eq('id', newJob.id)
    await db.from('search_runs').delete().eq('id', run.id)
    return Response.json({ error: 'Failed to enqueue search job' }, { status: 500 })
  }

  console.error('[lifecycle]', `run_id=${run.id} enqueued to QStash job_id=${newJob.id}`)
  return Response.json({ run_id: run.id, status: 'pending' }, { status: 202 })
}
