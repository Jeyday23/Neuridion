import type { createAdminClient } from '@/lib/supabase/admin'

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

