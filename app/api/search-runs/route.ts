import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeBfArM } from '@/lib/scrapers/bfarm'
import { stage1Filter } from '@/lib/claude/filter-pipeline'
import { PLANS, type PlanId } from '@/lib/plans'
import { sendSearchRunNotification } from '@/lib/email'

export async function POST(request: Request) {
  const supabase = await createClient()   // anon client — auth checks only
  const db = createAdminClient()          // service role — bypasses RLS for data ops

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { profile_id, period_from, period_to } = body as {
    profile_id?: string
    period_from?: string
    period_to?: string
  }

  if (!profile_id || !period_from || !period_to) {
    return Response.json(
      { error: 'profile_id, period_from, and period_to are required' },
      { status: 422 }
    )
  }

  // Enforce plan search-run limit
  const { data: userData } = await supabase
    .from('users')
    .select('plan, email')
    .eq('id', user.id)
    .single()

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
        { status: 403 }
      )
    }
  }

  // Fetch the profile and verify ownership
  const { data: profile, error: profileError } = await supabase
    .from('product_profiles')
    .select('device_name, manufacturer, intended_use, emdn_code, device_class')
    .eq('id', profile_id)
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Create the search run
  const { data: run, error: runError } = await db
    .from('search_runs')
    .insert({
      profile_id,
      user_id:              user.id,
      status:               'running',
      search_period_from:   period_from,
      search_period_to:     period_to,
      started_at:           new Date().toISOString(),
    })
    .select()
    .single()

  if (runError) {
    return Response.json({ error: runError.message }, { status: 500 })
  }

  try {
    // Step 1: Scrape BfArM
    const from = new Date(period_from)
    const to   = new Date(period_to + 'T23:59:59.999Z') // end of day, not midnight
    console.log('[search] Date range:', from.toISOString(), '→', to.toISOString())
    const items = await scrapeBfArM({ fromDate: from, toDate: to })
    console.log('[search] BfArM items scraped:', items.length)
    if (items.length > 0) {
      console.log('[search] Sample item:', JSON.stringify(items[0], null, 2))
    }

    // Step 2: Insert raw FSN results
    let insertedRows: {
      id: string
      title: string
      manufacturer: string
      raw_content: string
      fsn_date: string | null
    }[] = []

    if (items.length > 0) {
      const rows = items.map((item) => ({
        search_run_id: run.id,
        external_id:   item.external_id,
        title:         item.title,
        manufacturer:  item.manufacturer ?? '',
        fsn_date:      item.fsn_date || null,
        source_url:    item.source_url,
        raw_content:   item.raw_content,
        source:        item.source_db,
      }))

      console.log('[search] Inserting', rows.length, 'rows into fsn_results')
      const { data: inserted, error: insertError } = await db
        .from('fsn_results')
        .insert(rows)
        .select('id, title, manufacturer, raw_content, fsn_date')

      console.log('[search] Insert error:', insertError)
      console.log('[search] Inserted rows returned:', inserted?.length ?? 0)
      if (insertError) throw insertError
      insertedRows = inserted ?? []
    } else {
      console.log('[search] Skipping insert — 0 items scraped')
    }

    console.log('[search] Running AI filter on', insertedRows.length, 'rows')
    // Step 3: Run AI filter on every result
    const decisions = await Promise.all(
      insertedRows.map((row) =>
        stage1Filter(
          {
            title:        row.title,
            manufacturer: row.manufacturer,
            raw_content:  row.raw_content,
            fsn_date:     row.fsn_date,
          },
          profile
        ).then((d) => ({ ...d, fsn_result_id: row.id }))
      )
    )

    // Step 4: Insert filter decisions
    if (decisions.length > 0) {
      const decisionRows = decisions.map((d) => ({
        fsn_result_id: d.fsn_result_id,
        search_run_id: run.id,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence,
        model:         d.model,
      }))

      const { error: decisionsError } = await db
        .from('filter_decisions')
        .insert(decisionRows)

      if (decisionsError) throw decisionsError
    }

    // Step 5: Count by decision
    const counts = decisions.reduce(
      (acc, d) => {
        acc[d.decision] = (acc[d.decision] ?? 0) + 1
        return acc
      },
      { relevant: 0, uncertain: 0, excluded: 0 } as Record<string, number>
    )

    // Step 6: Mark run completed with counts
    await db
      .from('search_runs')
      .update({
        status:          'completed',
        completed_at:    new Date().toISOString(),
        relevant_count:  counts.relevant,
        uncertain_count: counts.uncertain,
        excluded_count:  counts.excluded,
      })
      .eq('id', run.id)

    // Step 7: Email notification for paid plans (fire-and-forget)
    const toEmail = userData?.email ?? user.email
    if (toEmail && userPlan !== 'free' && process.env.RESEND_API_KEY) {
      sendSearchRunNotification(toEmail, {
        deviceName:     profile.device_name,
        manufacturer:   profile.manufacturer,
        periodFrom:     period_from,
        periodTo:       period_to,
        relevantCount:  counts.relevant,
        uncertainCount: counts.uncertain,
        excludedCount:  counts.excluded,
        runId:          run.id,
      }).catch((err) => console.error('Email notification failed:', err))
    }

    return Response.json(
      {
        run_id:          run.id,
        result_count:    items.length,
        relevant_count:  counts.relevant,
        uncertain_count: counts.uncertain,
        excluded_count:  counts.excluded,
      },
      { status: 201 }
    )
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as Record<string, unknown>).message)
          : String(err)

    await db
      .from('search_runs')
      .update({ status: 'failed', error: errMsg })
      .eq('id', run.id)

    return Response.json({ error: errMsg, run_id: run.id }, { status: 500 })
  }
}
