import type { createAdminClient } from '@/lib/supabase/admin'

/** Finished runs may be reviewed even when coverage is degraded; the gap remains explicit. */
export function isRunReadyForReview(run: { status?: string | null; completed_at?: string | null }): boolean {
  return (run.status === 'complete' || run.status === 'degraded')
    && Boolean(run.completed_at && Number.isFinite(Date.parse(run.completed_at)))
}

type AdminClient = ReturnType<typeof createAdminClient>

export async function isRunAdjudicationComplete(
  db: AdminClient,
  runId: string,
): Promise<{ ready: boolean; error: string | null }> {
  const { data, error } = await db.rpc('is_search_run_adjudication_complete', {
    target_run_id: runId,
  } as never)

  if (error) {
    console.error('[adjudication/readiness]', error.message)
    return { ready: false, error: 'Adjudication readiness could not be verified.' }
  }

  return { ready: data === true, error: null }
}

