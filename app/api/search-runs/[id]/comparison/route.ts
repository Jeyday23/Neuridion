import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { compareCycles } from '@/lib/cycles/compare'
import { COMPARABLE_RUN_STATUSES, findPreviousRun, loadCycleSide, loadOwnedRun, type CycleRunRow } from '@/lib/cycles/load'

/**
 * GET /api/search-runs/[id]/comparison[?previous=<uuid>][&prefer_approved=true]
 *
 * Read-only previous-cycle comparison for the run owner. Any run that is not
 * owned by the caller, deleted, a synthetic canary, or (for `previous`) bound
 * to a different profile is reported as 404 so existence is not disclosed.
 */

const IdSchema = z.string().uuid()
const QuerySchema = z.object({
  previous: z.string().uuid().optional(),
  prefer_approved: z.enum(['true', 'false']).optional(),
}).strict()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!IdSchema.safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const query = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) {
    return Response.json({ error: 'Invalid query' }, { status: 400 })
  }
  if (query.data.previous === id) {
    return Response.json({ error: 'A run cannot be compared with itself' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`search-run-comparison:${user.id}`, 20, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    })
  }

  const db = createAdminClient()
  try {
    const current = await loadOwnedRun(db, id, user.id)
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })

    let previous: CycleRunRow | null
    if (query.data.previous) {
      previous = await loadOwnedRun(db, query.data.previous, user.id)
      if (!previous || previous.profile_id !== current.profile_id) {
        return Response.json({ error: 'Not found' }, { status: 404 })
      }
      if (!(COMPARABLE_RUN_STATUSES as readonly string[]).includes(previous.status)) {
        return Response.json(
          { error: 'The selected previous run did not finish with status complete or degraded.' },
          { status: 422 },
        )
      }
      if (previous.created_at >= current.created_at) {
        return Response.json({ error: 'The selected previous run was not created before this run.' }, { status: 422 })
      }
    } else {
      previous = await findPreviousRun(db, current, { preferApproved: query.data.prefer_approved === 'true' })
    }

    const [currentSide, previousSide] = await Promise.all([
      loadCycleSide(db, current),
      previous ? loadCycleSide(db, previous) : Promise.resolve(null),
    ])
    return Response.json(compareCycles(currentSide, previousSide), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('[search-runs/comparison]', err instanceof Error ? err.message : 'unknown error')
    return Response.json({ error: 'Comparison could not be loaded.' }, { status: 503 })
  }
}
