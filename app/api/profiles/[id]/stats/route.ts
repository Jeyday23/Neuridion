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

  const db = createAdminClient()

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { count, error: countError } = await db
    .from('search_runs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', id)

  if (countError) {
    return Response.json({ error: countError.message }, { status: 500 })
  }

  return Response.json({ search_run_count: count ?? 0 })
}
