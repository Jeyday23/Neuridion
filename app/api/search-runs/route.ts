import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeBfArM, type ScrapedFsn } from '@/lib/scrapers/bfarm'
import { stage1Filter } from '@/lib/claude/filter-pipeline'
import { PLANS, type PlanId } from '@/lib/plans'
import { sendSearchRunNotification } from '@/lib/email'
import { logAuditEvent } from '@/lib/audit'
import { chunkDateRange, daysBetween } from '@/lib/utils/date-chunks'

// 30 minutes — Render ignores this but documents intent for long 2-year searches
export const maxDuration = 1800

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
      period_from,
      period_to,
      started_at:           new Date().toISOString(),
    })
    .select()
    .single()

  if (runError) {
    return Response.json({ error: runError.message }, { status: 500 })
  }

  try {
    // Step 1: Scrape BfArM (chunked for long date ranges)
    const totalDays = daysBetween(period_from, period_to)
    console.log('[api] Received dates:', {
      fromRaw:   period_from,
      toRaw:     period_to,
      totalDays,
      serverNow: new Date().toISOString(),
      serverTZ:  Intl.DateTimeFormat().resolvedOptions().timeZone,
    })

    let allScraped: ScrapedFsn[] = []

    if (totalDays <= 90) {
      // Short search — single scrape
      const from = new Date(period_from + 'T00:00:00.000Z')
      const to   = new Date(period_to   + 'T23:59:59.999Z')
      console.log('[search] Single-chunk scrape:', from.toISOString(), '→', to.toISOString())
      allScraped = await scrapeBfArM({ fromDate: from, toDate: to })
      console.log('[search] Single-chunk result:', allScraped.length, 'items')
    } else {
      // Long search — chunk into 60-day pieces (accuracy > speed)
      const chunks = chunkDateRange(period_from, period_to, 60)
      console.log(`[search] Long search (${totalDays} days): ${chunks.length} chunks of 60 days`)

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        console.log(`[search] Chunk ${i + 1}/${chunks.length}: ${chunk.from} → ${chunk.to}`)
        try {
          const chunkItems = await scrapeBfArM({
            fromDate: new Date(chunk.from + 'T00:00:00.000Z'),
            toDate:   new Date(chunk.to   + 'T23:59:59.999Z'),
          })
          console.log(`[search] Chunk ${i + 1}: ${chunkItems.length} items`)
          allScraped.push(...chunkItems)
        } catch (chunkErr) {
          // Partial data > no data — continue with remaining chunks
          console.error(`[search] Chunk ${i + 1} failed, continuing:`, chunkErr)
        }
        // Polite pause between chunks
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Dedup across chunks by external_id
    const seen = new Set<string>()
    const items = allScraped.filter(item => {
      if (seen.has(item.external_id)) return false
      seen.add(item.external_id)
      return true
    })
    console.log(`[search] After dedup: ${allScraped.length} → ${items.length} items`)
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
        run_id:        run.id,
        external_id:   item.external_id,
        title:         item.title,
        manufacturer:  item.manufacturer ?? '',
        fsn_date:      item.fsn_date || null,
        source_url:    item.source_url,
        raw_content:   item.raw_content,
        source_db:     item.source_db,
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
    // Step 3: Run AI filter sequentially with GC pauses every 25 items
    const decisions: (Awaited<ReturnType<typeof stage1Filter>> & { fsn_result_id: string })[] = []
    for (let i = 0; i < insertedRows.length; i++) {
      const row = insertedRows[i]
      const d = await stage1Filter(
        { title: row.title, manufacturer: row.manufacturer, raw_content: row.raw_content, fsn_date: row.fsn_date },
        profile,
      )
      decisions.push({ ...d, fsn_result_id: row.id })
      if ((i + 1) % 25 === 0) {
        console.log(`[filter] Progress: ${i + 1}/${insertedRows.length} (${Math.round((i + 1) / insertedRows.length * 100)}%)`)
        await new Promise(r => setTimeout(r, 200))
      }
    }

    // Step 4: Insert filter decisions
    if (decisions.length > 0) {
      const decisionRows = decisions.map((d) => ({
        fsn_result_id: d.fsn_result_id,
        search_run_id: run.id,
        decision:      d.decision,
        rationale:     d.rationale,
        confidence:    d.confidence,
        model_used:    d.model,
        stage:         'stage1',
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
      { relevant: 0, uncertain: 0, excluded: 0, filter_failed: 0 } as Record<string, number>
    )

    // Step 6: Mark run completed with counts
    await db
      .from('search_runs')
      .update({
        status:               'complete',
        completed_at:         new Date().toISOString(),
        total_results:        items.length,
        relevant_count:       counts.relevant,
        uncertain_count:      counts.uncertain,
        excluded_count:       counts.excluded,
        filter_failed_count:  counts.filter_failed,
        dbs_searched:         [...new Set(items.map((i) => i.source_db))],
      })
      .eq('id', run.id)

    // Step 7: Audit log
    await logAuditEvent(user.id, 'search_run', {
      run_id:          run.id,
      profile_id,
      result_count:    items.length,
      relevant_count:  counts.relevant,
    }, request)

    // Step 8: Email notification for paid plans (fire-and-forget)
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
        run_id:               run.id,
        result_count:         items.length,
        relevant_count:       counts.relevant,
        uncertain_count:      counts.uncertain,
        excluded_count:       counts.excluded,
        filter_failed_count:  counts.filter_failed,
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
      .update({ status: 'error', error_message: errMsg })
      .eq('id', run.id)

    return Response.json({ error: errMsg, run_id: run.id }, { status: 500 })
  }
}
