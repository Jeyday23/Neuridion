import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('product_profiles')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { count, error: countError } = await supabase
    .from('search_runs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', id)

  if (countError) {
    console.error('[profiles/stats]', countError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return Response.json({ search_run_count: count ?? 0 })
}
