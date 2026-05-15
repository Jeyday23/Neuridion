import { NextResponse } from 'next/server'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'

export async function GET() {
  const caller = await checkIsAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rl = await rateLimit(`ai-metrics:${caller.id}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const admin = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  try {
    const [decisionsRes, cacheCountRes] = await Promise.all([
      admin
        .from('filter_decisions')
        .select('decision, confidence, model_used')
        .gte('created_at', thirtyDaysAgo),
      admin
        .from('filter_decision_cache')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo),
    ])

    if (decisionsRes.error) {
      console.error('[admin:ai-metrics]', decisionsRes.error.message)
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    if (cacheCountRes.error) {
      console.error('[admin:ai-metrics]', cacheCountRes.error.message)
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    const rows = decisionsRes.data ?? []
    const totalDecisions = rows.length

    const decisionDistribution = {
      relevant: 0,
      uncertain: 0,
      excluded: 0,
      filter_failed: 0,
    }

    let confidenceSum = 0
    let confidenceCount = 0
    const modelDistribution: Record<string, number> = {}

    for (const row of rows) {
      const d = row.decision as keyof typeof decisionDistribution
      if (d in decisionDistribution) {
        decisionDistribution[d]++
      }

      if (row.confidence != null) {
        confidenceSum += Number(row.confidence)
        confidenceCount++
      }

      if (row.model_used) {
        modelDistribution[row.model_used] = (modelDistribution[row.model_used] ?? 0) + 1
      }
    }

    const averageConfidence =
      confidenceCount > 0
        ? Math.round((confidenceSum / confidenceCount) * 1000) / 1000
        : 0

    const filterFailureRate =
      totalDecisions > 0
        ? Math.round((decisionDistribution.filter_failed / totalDecisions) * 10000) / 100
        : 0

    return NextResponse.json({
      period: { from: thirtyDaysAgo, to: now },
      totalDecisions,
      decisionDistribution,
      averageConfidence,
      filterFailureRate,
      modelDistribution,
      cacheEntries: cacheCountRes.count ?? 0,
    })
  } catch (err) {
    console.error('[admin:ai-metrics]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
